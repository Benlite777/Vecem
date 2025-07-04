from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import List
import os
import json
import uuid
from datetime import datetime
from src.utils.logger import logging
from src.models.models import DatasetInfo, DatasetEditInfo, UploadResponse
from src.utils.file_handlers import ensure_directories, save_uploaded_file
from src.database.mongodb import (
    save_metadata_and_update_user,
    user_profile_collection,
    datasets_collection
)
from src.utils.azure_storage import upload_to_blob, delete_dataset_blobs, create_and_upload_zip
from bson import ObjectId

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")

router = APIRouter()

@router.post("/upload", response_model=UploadResponse)
async def upload_files(
    files: List[UploadFile] = File(None),
    raw_files: List[UploadFile] = File(None),
    vectorized_files: List[UploadFile] = File(None),
    type: str = Form(...),
    datasetInfo: str = Form(...),
    uid: str = Form(...),
    isFolder: str = Form(None),
    folder_names: List[str] = Form(None),
    raw_folder_names: List[str] = Form(None),
    vectorized_folder_names: List[str] = Form(None),
    folders_meta: str = Form(None)
):
    try:
        if not uid:
            raise HTTPException(status_code=400, detail="User ID is required")

        # Get user profile to fetch username
        user_profile = await user_profile_collection.find_one({"uid": uid})
        if not user_profile:
            raise HTTPException(status_code=404, detail="User not found")
        
        username = user_profile.get("username")
        if not username:
            raise HTTPException(status_code=400, detail="Username not found")

        # Parse dataset info
        dataset_info = json.loads(datasetInfo)
        dataset_info_dict = dataset_info.get("dataset_info", {})
        dataset_info_dict["username"] = username
        
        # Extract vectorization settings from the correct location
        if type.lower() in ["vectorized", "both"]:
            dataset_info_dict["dimensions"] = dataset_info.get("dimensions")
            dataset_info_dict["vector_database"] = dataset_info.get("vector_database")
            dataset_info_dict["model_name"] = dataset_info.get("model_name")
        
        if "license" not in dataset_info_dict:
            raise HTTPException(status_code=400, detail="License is required")
        
        dataset_id = dataset_info_dict.get("datasetId") or str(uuid.uuid4())
        dataset_name = dataset_info_dict["name"].replace(" ", "_").lower()

        uploaded_files = {"raw": [], "vectorized": []}
        
        # Check if this is a folder upload
        is_folder_upload = isFolder == "true"
        
        logging.info(f"Processing {'folder' if is_folder_upload else 'file'} upload for dataset {dataset_name}")
        
        if is_folder_upload and folders_meta:
            try:
                # Parse folders metadata for better organization
                folders_structure = json.loads(folders_meta)
                logging.info(f"Folder structure: {folders_structure}")
            except Exception as e:
                logging.error(f"Error parsing folders metadata: {str(e)}")
        
        # Handle file uploads based on type
        if type.lower() == "both":
            if raw_files:
                # For folder uploads, we need to preserve the folder structure
                if is_folder_upload:
                    logging.info(f"Processing {len(raw_files)} raw files from folders")
                    # Group files by their relative paths to maintain structure
                    raw_url = await create_and_upload_zip(
                        raw_files, 
                        username, 
                        dataset_name, 
                        "raw", 
                        preserve_structure=True
                    )
                else:
                    raw_url = await create_and_upload_zip(raw_files, username, dataset_name, "raw")
                
                uploaded_files["raw"].append(raw_url)

            if vectorized_files:
                if is_folder_upload:
                    logging.info(f"Processing {len(vectorized_files)} vectorized files from folders")
                    vec_url = await create_and_upload_zip(
                        vectorized_files, 
                        username, 
                        dataset_name, 
                        "vectorized", 
                        preserve_structure=True
                    )
                else:
                    vec_url = await create_and_upload_zip(vectorized_files, username, dataset_name, "vectorized")
                
                uploaded_files["vectorized"].append(vec_url)
        else:
            if files:
                if is_folder_upload:
                    logging.info(f"Processing {len(files)} {type.lower()} files from folders")
                    url = await create_and_upload_zip(
                        files, 
                        username, 
                        dataset_name, 
                        type.lower(), 
                        preserve_structure=True
                    )
                else:
                    url = await create_and_upload_zip(files, username, dataset_name, type.lower())
                
                uploaded_files[type.lower()].append(url)

        # Prepare metadata
        metadata = {
            "dataset_id": dataset_id,
            "dataset_info": dataset_info_dict,
            "upload_type": type.lower(),
            "timestamp": datetime.now().isoformat(),
            "files": uploaded_files,
            "uid": uid,
            "is_folder": is_folder_upload
        }

        # Save metadata and update user profile
        await save_metadata_and_update_user(metadata)

        all_files = uploaded_files.get("raw", []) + uploaded_files.get("vectorized", [])
        return UploadResponse(
            success=True,
            message=f"Successfully uploaded dataset {dataset_id}",
            files=all_files
        )

    except Exception as e:
        logging.error(f"Upload error: {str(e)}")
        if 'dataset_name' in locals() and 'username' in locals():
            await delete_dataset_blobs(dataset_name, username)
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/upload/edit", response_model=UploadResponse)
async def edit_dataset_files(
    files: List[UploadFile] = File(None),
    raw_files: List[UploadFile] = File(None),
    vectorized_files: List[UploadFile] = File(None),
    type: str = Form(...),
    datasetInfo: str = Form(...),
    uid: str = Form(...)
):
    try:
        # Validate user
        if not uid:
            raise HTTPException(status_code=400, detail="User ID is required")

        user_profile = await user_profile_collection.find_one({"uid": uid})
        if not user_profile:
            raise HTTPException(status_code=404, detail="User not found")

        username = user_profile.get("username")
        if not username:
            raise HTTPException(status_code=400, detail="Username not found")

        # Parse dataset info for edit
        dataset_info = DatasetEditInfo.parse_raw(datasetInfo)
        dataset_info_dict = dataset_info.dict(exclude_none=True)

        dataset_name = dataset_info.name.replace(" ", "_").lower()
        uploaded_files = {"raw": [], "vectorized": []}

        # Get existing dataset
        existing_dataset = await datasets_collection.find_one(
            {"_id": ObjectId(dataset_info.datasetId)}
        )
        if not existing_dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")

        # Preserve existing files
        uploaded_files = existing_dataset.get("files", {"raw": [], "vectorized": []})
        
        # Ensure uploaded_files has both raw and vectorized keys
        if "raw" not in uploaded_files:
            uploaded_files["raw"] = []
        if "vectorized" not in uploaded_files:
            uploaded_files["vectorized"] = []

        try:
            # Handle file uploads based on type
            if type == "raw" and raw_files:
                raw_url = await create_and_upload_zip(raw_files, username, dataset_name, "raw")
                uploaded_files["raw"] = [raw_url]  # This replaces existing raw files
            elif type == "vectorized" and vectorized_files:
                vec_url = await create_and_upload_zip(vectorized_files, username, dataset_name, "vectorized")
                uploaded_files["vectorized"] = [vec_url]  # This replaces existing vectorized files

            # Determine upload_type based on available files
            has_raw = bool(uploaded_files.get("raw"))
            has_vectorized = bool(uploaded_files.get("vectorized"))
            
            # Update the upload_type to reflect the correct dataset type
            upload_type = "both" if has_raw and has_vectorized else (
                "raw" if has_raw else "vectorized" if has_vectorized else type
            )

            # Update dataset
            result = await datasets_collection.update_one(
                {"_id": ObjectId(dataset_info.datasetId)},
                {"$set": {
                    "files": uploaded_files,
                    "upload_type": upload_type,
                    "timestamp": datetime.now().isoformat()
                }}
            )

            return UploadResponse(
                success=True,
                message=f"Successfully updated dataset files",
                files=uploaded_files.get(type, [])
            )

        except Exception as upload_error:
            logging.error(f"Upload error: {str(upload_error)}")
            await delete_dataset_blobs(dataset_name, username)
            raise upload_error

    except Exception as e:
        logging.error(f"Error in edit_dataset_files: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/datasets/{dataset_id}")
async def delete_dataset(dataset_id: str):
    try:
        # Get dataset info to fetch username and dataset name
        dataset = await datasets_collection.find_one({"dataset_id": dataset_id})
        if not dataset:
            raise HTTPException(status_code=404, detail="Dataset not found")
            
        username = dataset.get("dataset_info", {}).get("username")
        dataset_name = dataset.get("dataset_info", {}).get("name", "").replace(" ", "_").lower()
        
        if not username or not dataset_name:
            raise HTTPException(status_code=400, detail="Username or dataset name not found")
        
        # Delete files from Azure Blob Storage
        await delete_dataset_blobs(dataset_name, username)
        
        # Delete dataset document from MongoDB
        result = await datasets_collection.delete_one({"dataset_id": dataset_id})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Dataset not found")
            
        return {"message": "Dataset deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
