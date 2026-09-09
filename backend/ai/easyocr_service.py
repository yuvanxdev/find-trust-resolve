import logging
import threading

logger = logging.getLogger(__name__)

class EasyOCRService:
    _instance = None
    _lock = threading.Lock()
    _reader = None

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(EasyOCRService, cls).__new__(cls)
            return cls._instance

    def _get_reader(self):
        if self._reader is None:
            with self._lock:
                if self._reader is None:
                    try:
                        import easyocr
                        logger.info("Initializing EasyOCR Model (CPU mode)...")
                        self._reader = easyocr.Reader(['en'], gpu=False, verbose=False)
                        logger.info("EasyOCR initialized successfully.")
                    except Exception as e:
                        logger.error(f"Failed to initialize EasyOCR: {e}")
                        raise
        return self._reader

    def extract_text(self, image_path: str) -> list[str]:
        """
        Extract text from an image using EasyOCR.
        Returns a list of extracted string lines.
        """
        try:
            reader = self._get_reader()
            logger.info(f"Extracting text from: {image_path}")
            # readtext returns a list of tuples: (bounding box, text, confidence)
            results = reader.readtext(image_path)
            extracted = [res[1] for res in results]
            logger.info(f"OCR extracted {len(extracted)} text blocks.")
            return extracted
        except Exception as e:
            logger.error(f"OCR extraction failed for {image_path}: {e}")
            raise

easyocr_service = EasyOCRService()
