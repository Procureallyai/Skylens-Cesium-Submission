"""
Configuration management for Skylens - Cesium Submission Version
This is a redacted version showing configuration structure without sensitive values.
"""
import os
from typing import Optional
from pydantic import BaseSettings

class AppConfig(BaseSettings):
    """
    Application configuration with Azure Key Vault integration.
    
    In production:
    - Reads from Azure Key Vault via managed identity
    - Falls back to environment variables for local development
    - No secrets stored in code or repository
    """
    
    # CORS configuration
    allow_origins: str = "*"  # Redacted - actual: specific Azure Static Website URL
    
    # METAR weather provider configuration
    metar_provider: str = "awc"  # Options: "awc", "avwx"
    avwx_api_key: Optional[str] = None  # Redacted - actual: from Key Vault
    
    # Azure OpenAI configuration (optional)
    aoai_endpoint: Optional[str] = None  # Redacted - actual: Azure OpenAI endpoint
    aoai_api_key: Optional[str] = None  # Redacted - actual: from Key Vault
    aoai_api_version: str = "2024-08-01-preview"
    aoai_deployment_chat: str = "gpt-4o"
    aoai_deployment_embed: str = "text-embedding-3-small"
    
    # RAG provider configuration
    rag_provider: str = "local"  # Options: "local", "azure"
    
    # Azure Key Vault configuration
    keyvault_name: Optional[str] = None  # Redacted - actual: Key Vault name
    
    # Logging configuration
    log_level: str = "INFO"
    
    class Config:
        env_file = ".env"
        case_sensitive = False
        
        # In production, these would be loaded from Azure Key Vault
        # via managed identity authentication
        
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        
        # In production: Load secrets from Azure Key Vault
        # if self.keyvault_name:
        #     self._load_from_keyvault()
    
    def _load_from_keyvault(self):
        """
        Load configuration from Azure Key Vault using managed identity.
        
        This method is redacted for security - actual implementation:
        - Uses Azure SDK with DefaultAzureCredential
        - Loads secrets like AOAI keys, AVWX keys, CORS origins
        - Provides fallback to environment variables
        """
        pass
    
    @property
    def cors_origins(self) -> list:
        """Parse CORS origins from comma-separated string"""
        if self.allow_origins == "*":
            return ["*"]
        return [origin.strip() for origin in self.allow_origins.split(",")]
    
    @property
    def has_aoai(self) -> bool:
        """Check if Azure OpenAI is configured"""
        return bool(self.aoai_endpoint and self.aoai_api_key)
    
    @property
    def has_avwx(self) -> bool:
        """Check if AVWX weather API is configured"""
        return bool(self.avwx_api_key)

# Global configuration instance
# In production, this loads from Azure Key Vault + environment
config = AppConfig()

# Example environment variables for local development:
# ALLOW_ORIGINS=https://your-static-site.z33.web.core.windows.net
# METAR_PROVIDER=awc
# RAG_PROVIDER=local
# LOG_LEVEL=INFO
