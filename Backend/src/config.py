from typing import List, Optional
import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # MongoDB Configuration
    MONGODB_URL: Optional[str] = None
    DATABASE_NAME: str = "vecem"
    
    # Azure Storage Configuration
    AZURE_STORAGE_CONNECTION_STRING: Optional[str] = None
    AZURE_CONTAINER_NAME: str = "datasets"
    
    # API Configuration
    PORT: int = 5000
    ENV: str = "development"
    
    # Logging Configuration
    LOG_LEVEL: str = "INFO"
    
    # CORS Configuration
    CORS_ORIGINS: List[str] = ["https://ambitious-field-0e8c9d300.6.azurestaticapps.net","https://vecem.in","*"]

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    def validate_settings(self) -> None:
        missing_vars = []
        
        if not self.MONGODB_URL:
            missing_vars.append("MONGODB_URL")
        
        if not self.AZURE_STORAGE_CONNECTION_STRING:
            missing_vars.append("AZURE_STORAGE_CONNECTION_STRING")
        
        if missing_vars:
            error_message = (
                "Missing required environment variables:\n"
                f"{', '.join(missing_vars)}\n\n"
                "Please ensure these variables are set in your .env file or environment.\n"
                "Example .env file:\n"
                "MONGODB_URL=mongodb+srv
            )
            raise ValueError(error_message)

settings = Settings()
try:
    settings.validate_settings()
except ValueError as e:
    print("\033[91mConfiguration Error:\033[0m")  # Red color for error
    print(str(e))
    raise SystemExit(1)
