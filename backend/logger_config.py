import logging
import os
from logging.handlers import RotatingFileHandler

def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        log_level = os.environ.get("LOG_LEVEL", "INFO").upper()
        level = getattr(logging, log_level, logging.INFO)
        logger.setLevel(level)

        formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s")

        # Console handler
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        logger.addHandler(console_handler)

        # File handler
        log_dir = "/app/data/logs"
        os.makedirs(log_dir, exist_ok=True)
        log_name = name.replace('powerball-analyzer-db', 'powerball-db').replace('powerball-api', 'api')
        log_file = os.path.join(log_dir, f"{log_name}.log")
        file_handler = RotatingFileHandler(
            log_file, maxBytes=10*1024*1024, backupCount=5
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    return logger