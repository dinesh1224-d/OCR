#!/usr/bin/env python3
"""
Run the FastAPI backend server
"""
import uvicorn
import os
from pathlib import Path

if __name__ == "__main__":
    # Default port
    port = int(os.environ.get("PORT", 8010))
    host = os.environ.get("HOST", "0.0.0.0")
    
    # Run the server
    uvicorn.run(
        "server:app",
        host=host,
        port=port,
        reload=True,  # Enable auto-reload in development
        log_level="info"
    )

