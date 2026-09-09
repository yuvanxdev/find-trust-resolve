import logging
import threading
import numpy as np
import faiss

logger = logging.getLogger(__name__)

class FAISSService:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(FAISSService, cls).__new__(cls)
                cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if not self._initialized:
            # We track image and text indices separately
            # CLIP vit-base-patch32 embedding dimension is 512
            self.image_index = faiss.IndexIDMap(faiss.IndexFlatIP(512))
            # SBERT all-MiniLM-L6-v2 embedding dimension is 384
            self.text_index = faiss.IndexIDMap(faiss.IndexFlatIP(384))
            
            # Map item ID to report_type so we can efficiently filter cross-types during search
            self.item_types = {}
            self.index_lock = threading.Lock()
            self._initialized = True

    def add_item(self, item_id: int, report_type: str, image_embedding: list = None, text_embedding: list = None):
        with self.index_lock:
            self.item_types[item_id] = report_type
            
            if image_embedding:
                # Remove if exists to prevent duplicates (faiss doesn't natively update)
                self.image_index.remove_ids(np.array([item_id], dtype=np.int64))
                vector = np.array([image_embedding], dtype=np.float32)
                # Ensure normalized for inner product (cosine similarity)
                faiss.normalize_L2(vector)
                self.image_index.add_with_ids(vector, np.array([item_id], dtype=np.int64))

            if text_embedding:
                self.text_index.remove_ids(np.array([item_id], dtype=np.int64))
                vector = np.array([text_embedding], dtype=np.float32)
                faiss.normalize_L2(vector)
                self.text_index.add_with_ids(vector, np.array([item_id], dtype=np.int64))

    def search_candidates(self, query_item_id: int, query_report_type: str, query_image_emb: list = None, query_text_emb: list = None, k: int = 10):
        # We want to match LOST against FOUND, and FOUND against LOST
        target_type = "FOUND" if query_report_type == "LOST" else "LOST"
        candidates = {}

        with self.index_lock:
            # Search Image
            if query_image_emb and self.image_index.ntotal > 0:
                vector = np.array([query_image_emb], dtype=np.float32)
                faiss.normalize_L2(vector)
                D, I = self.image_index.search(vector, min(k * 2, self.image_index.ntotal))
                for dist, matched_id in zip(D[0], I[0]):
                    if matched_id != -1 and matched_id != query_item_id and self.item_types.get(matched_id) == target_type:
                        candidates[matched_id] = {"image_similarity": float(dist), "text_similarity": 0.0}

            # Search Text
            if query_text_emb and self.text_index.ntotal > 0:
                vector = np.array([query_text_emb], dtype=np.float32)
                faiss.normalize_L2(vector)
                D, I = self.text_index.search(vector, min(k * 2, self.text_index.ntotal))
                for dist, matched_id in zip(D[0], I[0]):
                    if matched_id != -1 and matched_id != query_item_id and self.item_types.get(matched_id) == target_type:
                        if matched_id in candidates:
                            candidates[matched_id]["text_similarity"] = float(dist)
                        else:
                            candidates[matched_id] = {"image_similarity": 0.0, "text_similarity": float(dist)}
                            
        return candidates

    def rebuild_from_db(self, db_session):
        from app.models import Item
        with self.index_lock:
            self.image_index.reset()
            self.text_index.reset()
            self.item_types.clear()
            
            logger.info("Rebuilding FAISS index from PostgreSQL...")
            # Load in batches to prevent massive memory spikes
            batch_size = 1000
            offset = 0
            while True:
                items = db_session.query(Item).offset(offset).limit(batch_size).all()
                if not items:
                    break
                
                img_vectors = []
                img_ids = []
                txt_vectors = []
                txt_ids = []

                for item in items:
                    # using the string representation for Enum compatibility depending on SQLEnum setup
                    report_type_str = item.report_type.value if hasattr(item.report_type, "value") else str(item.report_type)
                    self.item_types[item.id] = report_type_str
                    
                    if item.image_embedding:
                        img_vectors.append(item.image_embedding)
                        img_ids.append(item.id)
                    if item.text_embedding:
                        txt_vectors.append(item.text_embedding)
                        txt_ids.append(item.id)
                
                if img_vectors:
                    vecs = np.array(img_vectors, dtype=np.float32)
                    faiss.normalize_L2(vecs)
                    self.image_index.add_with_ids(vecs, np.array(img_ids, dtype=np.int64))
                
                if txt_vectors:
                    vecs = np.array(txt_vectors, dtype=np.float32)
                    faiss.normalize_L2(vecs)
                    self.text_index.add_with_ids(vecs, np.array(txt_ids, dtype=np.int64))
                
                offset += batch_size
            
            logger.info(f"FAISS rebuilt. Image vectors: {self.image_index.ntotal}, Text vectors: {self.text_index.ntotal}")
