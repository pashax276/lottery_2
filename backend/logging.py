# backend/logger.py
import os
import logging
import json
from datetime import datetime
from logging.handlers import RotatingFileHandler

# Create logs directory if it doesn't exist
os.makedirs('data/logs', exist_ok=True)

# Configure logging format
LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s'
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO').upper()

# Configure root logger
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format=LOG_FORMAT,
    handlers=[
        # Console handler
        logging.StreamHandler(),
        # File handler with rotation
        RotatingFileHandler(
            'data/logs/app.log', 
            maxBytes=10*1024*1024,  # 10MB
            backupCount=5,
            encoding='utf-8'
        )
    ]
)

# Create specialized loggers
def get_logger(name, add_file_handler=True):
    """
    Get a configured logger with the given name
    
    Args:
        name: The name of the logger
        add_file_handler: Whether to add a file handler specific to this logger
        
    Returns:
        logging.Logger: The configured logger
    """
    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, LOG_LEVEL))
    
    # Add component-specific file handler if requested
    if add_file_handler:
        # Create a file handler for this specific component
        component_file_handler = RotatingFileHandler(
            f'data/logs/{name.split(".")[-1]}.log',
            maxBytes=5*1024*1024,  # 5MB
            backupCount=3,
            encoding='utf-8'
        )
        formatter = logging.Formatter(LOG_FORMAT)
        component_file_handler.setFormatter(formatter)
        logger.addHandler(component_file_handler)
    
    return logger

# Helper function to log requests/responses
def log_api_call(logger, method, url, status_code=None, request_data=None, response_data=None, error=None):
    """
    Log details of an API call
    
    Args:
        logger: The logger to use
        method: HTTP method (GET, POST, etc.)
        url: The URL that was called
        status_code: The HTTP status code of the response
        request_data: The data sent in the request (if any)
        response_data: The data received in the response (if any)
        error: Any error that occurred (if any)
    """
    log_data = {
        'timestamp': datetime.now().isoformat(),
        'method': method,
        'url': url
    }
    
    if status_code is not None:
        log_data['status_code'] = status_code
    
    if request_data is not None:
        # Truncate large request data
        if isinstance(request_data, dict) and len(str(request_data)) > 1000:
            log_data['request_data'] = str(request_data)[:1000] + '... [truncated]'
        else:
            log_data['request_data'] = request_data
    
    if response_data is not None:
        # Truncate large response data
        if isinstance(response_data, dict) and len(str(response_data)) > 1000:
            log_data['response_data'] = str(response_data)[:1000] + '... [truncated]'
        else:
            log_data['response_data'] = response_data
    
    if error is not None:
        log_data['error'] = str(error)
    
    # Format as JSON for structured logging
    try:
        logger.info(f"API Call: {json.dumps(log_data)}")
    except (TypeError, ValueError):
        # Fall back to string representation if JSON serialization fails
        logger.info(f"API Call: {str(log_data)}")

# Suppress bcrypt warning
import warnings
warnings.filterwarnings("ignore", ".*trapped.*bcrypt version.*", UserWarning)