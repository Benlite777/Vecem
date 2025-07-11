from azure.storage.blob import BlobServiceClient, BlobClient
from fastapi import UploadFile
import os
import shutil
import tempfile
import logging
import asyncio
from typing import List

STORAGE_ACCOUNT_URL = "https://vecem.blob.core.windows.net"
SAS_TOKEN = "sp=racwd&st=2025-02-19T16:15:56Z&se=2099-02-20T00:15:56Z&spr=https&sv=2022-11-02&sr=c&sig=ku6eP3I24d7lanXfI0OJgt4lKWO3jL3r0tgjXl6OS8Y%3D"
CONTAINER_NAME = "datasets"

blob_service_client = BlobServiceClient(account_url=STORAGE_ACCOUNT_URL, credential=SAS_TOKEN)
container_client = blob_service_client.get_container_client(CONTAINER_NAME)

async def create_and_upload_zip(
    files: List[UploadFile], 
    username: str, 
    dataset_name: str, 
    file_type: str,
    preserve_structure: bool = False
) -> str:
    """Create separate zip files for raw and vectorized data and upload them to Azure Blob Storage.
    
    Args:
        files: List of uploaded files
        username: User's username
        dataset_name: Name of the dataset
        file_type: Type of files ('raw' or 'vectorized')
        preserve_structure: Whether to preserve folder structure in the zip
        
    Returns:
        URL of the uploaded zip blob
    """
    temp_dir = None
    
    try:
        # Create temporary directory structure
        temp_dir = tempfile.mkdtemp()
        dataset_dir = os.path.join(temp_dir, username, dataset_name, file_type)
        os.makedirs(dataset_dir, exist_ok=True)

        # Save files to temporary directory
        for file in files:
            file_content = await file.read()
            
            if preserve_structure and hasattr(file, 'filename') and '/' in file.filename:
                # For folder uploads, preserve the structure
                relative_path = file.filename
                file_dir = os.path.join(dataset_dir, os.path.dirname(relative_path))
                os.makedirs(file_dir, exist_ok=True)
                file_path = os.path.join(dataset_dir, relative_path)
                logging.info(f"Preserving folder structure for: {relative_path}")
            else:
                # For flat file uploads, just use the filename
                file_path = os.path.join(dataset_dir, file.filename)
                
            # Ensure the directory exists (for deeply nested folders)
            os.makedirs(os.path.dirname(file_path), exist_ok=True)
            
            with open(file_path, "wb") as f:
                f.write(file_content)
            await file.seek(0)  # Reset file pointer

        # Create zip file for the specific file_type folder
        if preserve_structure:
            # When preserving structure, zip from the dataset directory (one level up)
            zip_base_path = os.path.join(temp_dir, username, dataset_name, f"{file_type}")
            parent_dir = os.path.join(temp_dir, username, dataset_name)
            zip_path = f"{zip_base_path}.zip"
            shutil.make_archive(
                base_name=zip_base_path,
                format='zip',
                root_dir=parent_dir,
                base_dir=file_type
            )
        else:
            # Original flat file zipping
            zip_base_path = os.path.join(temp_dir, username, dataset_name, f"{file_type}")
            zip_path = f"{zip_base_path}.zip"
            shutil.make_archive(
                base_name=zip_base_path,
                format='zip',
                root_dir=dataset_dir
            )

        # Upload zip to Azure with correct folder structure
        blob_name = f"{username}/{dataset_name}/{file_type}.zip"
        blob_client = container_client.get_blob_client(blob_name)
        
        with open(zip_path, "rb") as zip_file:
            blob_client.upload_blob(zip_file, overwrite=True)

        return blob_client.url

    except Exception as e:
        logging.error(f"Error in create_and_upload_zip: {str(e)}")
        raise

    finally:
        # Clean up temporary directory
        if temp_dir and os.path.exists(temp_dir):
            shutil.rmtree(temp_dir)

async def upload_to_blob(file: UploadFile, dataset_id: str, dataset_name: str, file_type: str, username: str) -> str:
    try:
        # Create a unique blob path: username/dataset_name/file_type/filename
        blob_path = f"{username}/{dataset_name}/{file_type}/{file.filename}"
        blob_client = container_client.get_blob_client(blob_path)
        
        # Read file content
        file_content = await file.read()
        
        # Upload the file
        blob_client.upload_blob(file_content, overwrite=True)
        
        await file.seek(0)  # Reset file pointer
        return blob_client.url
        
    except Exception as e:
        logging.error(f"Error uploading to blob storage: {str(e)}")
        raise

async def delete_dataset_blobs(dataset_name: str, username: str):
    try:
        # List all blobs in the dataset directory under the user's folder
        blob_list = container_client.list_blobs(name_starts_with=f"{username}/{dataset_name}")
        
        # Delete each blob
        for blob in blob_list:
            container_client.delete_blob(blob.name)
            
    except Exception as e:
        logging.error(f"Error deleting dataset blobs: {str(e)}")
        raise
