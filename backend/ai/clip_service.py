import logging
import threading
from PIL import Image
import torch
import numpy as np

logger = logging.getLogger(__name__)

class CLIPService:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(CLIPService, cls).__new__(cls)
                cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if not self._initialized:
            self.processor = None
            self.model = None
            self._initialized = True

    def _load_model(self):
        with self._lock:
            if self.model is None:
                logger.info("Loading CLIP model lazily on CPU...")
                from transformers import CLIPProcessor, CLIPModel
                self.model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
                self.processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
                self.model.eval()
                logger.info("CLIP model loaded successfully.")

    def generate_embedding(self, image_path: str) -> list[float]:
        if not image_path:
            return None
            
        try:
            self._load_model()
            image = Image.open(image_path).convert("RGB")
            inputs = self.processor(images=image, return_tensors="pt")
            
            with torch.no_grad():
                outputs = self.model.get_image_features(**inputs)
                
            if hasattr(outputs, "image_embeds"):
                image_features = outputs.image_embeds
            elif hasattr(outputs, "last_hidden_state"):
                image_features = outputs.pooler_output if hasattr(outputs, "pooler_output") else outputs.last_hidden_state
            elif isinstance(outputs, torch.Tensor):
                image_features = outputs
            else:
                image_features = outputs[0] if isinstance(outputs, tuple) else outputs
                
            if hasattr(image_features, "pooler_output"):
                 image_features = image_features.pooler_output
                 
            # If it's a BaseModelOutputWithPooling, it might still have pooler_output as an attribute, but usually outputs is the tensor in older versions.
            
            # To be absolutely sure:
            if not isinstance(image_features, torch.Tensor):
                 if hasattr(image_features, "pooler_output"):
                     image_features = image_features.pooler_output
                 elif hasattr(image_features, "image_embeds"):
                     image_features = image_features.image_embeds
            
            # Normalize for cosine similarity / inner product
            image_features = image_features / image_features.norm(p=2, dim=-1, keepdim=True)
            return image_features.squeeze().tolist()
        except Exception as e:
            logger.error(f"Failed to generate CLIP embedding for {image_path}: {e}")
            return None
