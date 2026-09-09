import logging
import threading
import torch

logger = logging.getLogger(__name__)

class SBERTService:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(SBERTService, cls).__new__(cls)
                cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if not self._initialized:
            self.model = None
            self._initialized = True

    def _load_model(self):
        with self._lock:
            if self.model is None:
                logger.info("Loading SBERT model lazily on CPU...")
                from sentence_transformers import SentenceTransformer
                self.model = SentenceTransformer("all-MiniLM-L6-v2", device="cpu")
                logger.info("SBERT model loaded successfully.")

    def construct_text_representation(self, item) -> str:
        parts = []
        if item.item_name: parts.append(f"Name: {item.item_name}")
        if item.description: parts.append(f"Description: {item.description}")
        if getattr(item, "category", None): parts.append(f"Category: {item.category}")
        if getattr(item, "color", None): parts.append(f"Color: {item.color}")
        if getattr(item, "brand", None): parts.append(f"Brand: {item.brand}")
        if item.location: parts.append(f"Location: {item.location}")
        
        return " | ".join(parts)

    def generate_embedding(self, item) -> list[float]:
        text = self.construct_text_representation(item)
        if not text.strip():
            return None
            
        try:
            self._load_model()
            # encode with normalize_embeddings=True for cosine similarity
            embedding = self.model.encode(text, normalize_embeddings=True, convert_to_tensor=True)
            return embedding.cpu().tolist()
        except Exception as e:
            logger.error(f"Failed to generate SBERT embedding for Item {item.id}: {e}")
            return None
