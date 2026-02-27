"""
train_real_xrays.py
=====================
Trains the OsteoAI CNN on REAL bone X-ray images using:
  - MobileNetV2 with pretrained ImageNet weights (transfer learning)
  - Real dataset from Kaggle (auto-downloaded if kaggle API is configured)
  - Proper fine-tuning with augmentation and class balancing

Dataset options (in order of preference):
  1. Kaggle: "osteoporosis-knee-xray-dataset" (bone X-rays, labeled Normal/Osteopenia/Osteoporosis)
  2. Kaggle: "bone-fracture-detection-computer-vision-project" (fallback)
  3. Auto-generates improved synthetic data as a last resort

Usage:
  python train_real_xrays.py
  python train_real_xrays.py --dataset-dir /path/to/your/xray/images

Your dataset folder must have this structure:
  dataset/
    Normal/         <- X-ray images of healthy bones
    Osteopenia/     <- X-ray images with mild bone loss
    Osteoporosis/   <- X-ray images with severe bone loss
"""

import os
import sys
import json
import argparse
import shutil
import numpy as np
from pathlib import Path

# ── Parse args ──────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--dataset-dir", type=str, default=None,
                    help="Path to your dataset folder with Normal/Osteopenia/Osteoporosis subfolders")
parser.add_argument("--epochs", type=int, default=25, help="Max training epochs")
parser.add_argument("--batch-size", type=int, default=8, help="Batch size")
parser.add_argument("--skip-kaggle", action="store_true", help="Skip Kaggle download attempt")
args = parser.parse_args()

MODELS_DIR = Path("../backend/models")
MODELS_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR = Path("data/real_xrays")

# ──────────────────────────────────────────────────────────────────────────────
# STEP 1: Dataset Acquisition
# ──────────────────────────────────────────────────────────────────────────────

def try_kaggle_download():
    """Try to download a real bone X-ray dataset from Kaggle."""
    try:
        import kaggle
        print("\n[Dataset] Kaggle API found. Downloading bone X-ray dataset...")
        DATA_DIR.mkdir(parents=True, exist_ok=True)

        # Try dataset 1: Osteoporosis X-ray dataset
        try:
            kaggle.api.dataset_download_files(
                "tommyngx/digital-knee-xray",
                path=str(DATA_DIR / "raw"),
                unzip=True
            )
            print("  ✔ Downloaded knee X-ray dataset from Kaggle")
            return str(DATA_DIR / "raw")
        except Exception as e1:
            print(f"  ! Dataset 1 failed: {e1}")

        # Try dataset 2
        try:
            kaggle.api.dataset_download_files(
                "stevepython/osteoporosis-dataset",
                path=str(DATA_DIR / "raw"),
                unzip=True
            )
            print("  ✔ Downloaded osteoporosis dataset from Kaggle")
            return str(DATA_DIR / "raw")
        except Exception as e2:
            print(f"  ! Dataset 2 failed: {e2}")

    except ImportError:
        print("\n[Dataset] Kaggle API not installed.")
        print("  To use real X-ray data from Kaggle:")
        print("  1. pip install kaggle")
        print("  2. Get your Kaggle API key from https://www.kaggle.com/account")
        print("  3. Place kaggle.json in C:\\Users\\<you>\\.kaggle\\")
        print("  4. Run this script again")
    except Exception as e:
        print(f"\n[Dataset] Kaggle download failed: {e}")

    return None


def prepare_dataset(raw_dir):
    """
    Try to find or restructure the dataset into Normal/Osteopenia/Osteoporosis subfolders.
    Returns the path to a properly structured directory, or None.
    """
    raw_path = Path(raw_dir)
    expected_classes = {"Normal", "Osteopenia", "Osteoporosis"}
    found_classes = {d.name for d in raw_path.iterdir() if d.is_dir()}

    if expected_classes.issubset(found_classes):
        print(f"  ✔ Found proper class structure in {raw_path}")
        return str(raw_path)

    # Try to detect flat structure and auto-split
    all_images = list(raw_path.rglob("*.jpg")) + list(raw_path.rglob("*.png")) + list(raw_path.rglob("*.jpeg"))
    if len(all_images) > 0:
        print(f"  Found {len(all_images)} images in {raw_path}. Please organize them into:")
        print(f"    {raw_path}/Normal/")
        print(f"    {raw_path}/Osteopenia/")
        print(f"    {raw_path}/Osteoporosis/")
        print("  Then run this script again with --dataset-dir pointing to that folder.")

    return None


def generate_realistic_synthetic():
    """
    Generate improved synthetic X-ray images with realistic bone density variation.
    Normal class: very high brightness, thick cortex, near-zero porosity — truly healthy.
    Osteopenia: moderate brightness, moderate cortex, moderate porosity.
    Osteoporosis: very low brightness, thin cortex, high porosity — clearly diseased.
    """
    print("\n[Dataset] Generating enhanced synthetic bone X-rays...")
    try:
        from PIL import Image, ImageDraw, ImageFilter
    except ImportError:
        print("  ! PIL not found. Run: pip install Pillow")
        return None

    out_dir = DATA_DIR / "synthetic"
    classes = {
        # Healthy person: very bright, dense, thick cortex, minimal porosity
        "Normal": {
            "n": 300,
            "brightness_range": (200, 240),
            "cortical": 0.95,
            "porosity": 2,
            "trabecular_density": 30,
        },
        # Mild bone loss: moderate brightness, thinning cortex
        "Osteopenia": {
            "n": 300,
            "brightness_range": (130, 175),
            "cortical": 0.60,
            "porosity": 20,
            "trabecular_density": 15,
        },
        # Severe bone loss: dark, porous, very thin cortex
        "Osteoporosis": {
            "n": 300,
            "brightness_range": (40, 100),
            "cortical": 0.25,
            "porosity": 65,
            "trabecular_density": 4,
        },
    }

    np.random.seed(42)
    for class_name, params in classes.items():
        class_dir = out_dir / class_name
        class_dir.mkdir(parents=True, exist_ok=True)
        n = params["n"]
        bmin, bmax = params["brightness_range"]
        print(f"  Generating {n} synthetic {class_name} images...")

        for i in range(n):
            img_size = 224
            brightness = np.random.randint(bmin, bmax)

            # Black background (simulate X-ray film)
            base = np.zeros((img_size, img_size), dtype=np.uint8)
            img = Image.fromarray(base, mode="L")
            draw = ImageDraw.Draw(img)
            cx, cy = img_size // 2, img_size // 2

            # --- Soft tissue region (mid-gray surrounding bone) ---
            soft_tissue_b = max(20, brightness // 4)
            st_r = np.random.randint(100, 108)
            draw.ellipse([cx - st_r, cy - st_r, cx + st_r, cy + st_r], fill=soft_tissue_b)

            # --- Cortical bone (bright outer shell) ---
            outer_r = np.random.randint(72, 88)
            cortical_b = min(255, int(brightness * params["cortical"]) + np.random.randint(20, 50))
            draw.ellipse([cx - outer_r, cy - outer_r, cx + outer_r, cy + outer_r], fill=cortical_b)

            # --- Trabecular / cancellous bone (interior) ---
            inner_r = int(outer_r * (1.0 - (1.0 - params["cortical"]) * 0.45))
            draw.ellipse([cx - inner_r, cy - inner_r, cx + inner_r, cy + inner_r], fill=brightness)

            # --- Trabecular lines (internal bone struts) ---
            for _ in range(params["trabecular_density"]):
                x1 = np.random.randint(cx - inner_r + 5, cx + inner_r - 5)
                y1 = np.random.randint(cy - inner_r + 5, cy + inner_r - 5)
                x2 = x1 + np.random.randint(-18, 18)
                y2 = y1 + np.random.randint(-18, 18)
                line_b = max(30, brightness - np.random.randint(15, 40))
                draw.line([(x1, y1), (x2, y2)], fill=line_b, width=1)

            # --- Medullary canal (dark center) ---
            canal_r = int(outer_r * (0.28 + (1 - params["cortical"]) * 0.2))
            canal_b = max(5, brightness - 80 - np.random.randint(0, 30))
            draw.ellipse([cx - canal_r, cy - canal_r, cx + canal_r, cy + canal_r], fill=canal_b)

            # --- Porosity holes (more = sicker bone) ---
            for _ in range(params["porosity"]):
                px = np.random.randint(cx - inner_r + 3, cx + inner_r - 3)
                py = np.random.randint(cy - inner_r + 3, cy + inner_r - 3)
                pr = np.random.randint(2, 8)
                pore_b = max(0, brightness - np.random.randint(50, 100))
                draw.ellipse([px, py, px + pr, py + pr], fill=pore_b)

            # Slight blur for realism
            img = img.filter(ImageFilter.GaussianBlur(radius=np.random.uniform(0.3, 1.2)))
            img = img.convert("RGB")
            img.save(class_dir / f"{class_name.lower()}_{i:04d}.png")

    total = sum(p["n"] for p in classes.values())
    print(f"  ✔ Generated synthetic dataset in {out_dir}")
    print(f"  Total: {total} images (300 per class)")
    return str(out_dir)



# ──────────────────────────────────────────────────────────────────────────────
# STEP 2: Train CNN with Transfer Learning
# ──────────────────────────────────────────────────────────────────────────────

def train_model(dataset_dir, epochs=25, batch_size=8):
    """Train MobileNetV2 with pretrained ImageNet weights on the dataset."""
    print(f"\n[Training] Starting transfer learning from {dataset_dir}")

    try:
        import tensorflow as tf
        from tensorflow.keras import layers, models, optimizers
        from tensorflow.keras.preprocessing.image import ImageDataGenerator
        from tensorflow.keras.callbacks import (
            EarlyStopping, ModelCheckpoint, ReduceLROnPlateau, TensorBoard
        )
        print(f"  TensorFlow: {tf.__version__}")
    except ImportError:
        print("  ! TensorFlow not installed. Run: pip install tensorflow-cpu")
        return False

    IMG_SIZE = (224, 224)

    # Count images per class
    dataset_path = Path(dataset_dir)
    class_counts = {}
    for cls in ["Normal", "Osteopenia", "Osteoporosis"]:
        cls_dir = dataset_path / cls
        if cls_dir.exists():
            imgs = list(cls_dir.glob("*.jpg")) + list(cls_dir.glob("*.png")) + list(cls_dir.glob("*.jpeg"))
            class_counts[cls] = len(imgs)
    print(f"  Dataset: {class_counts}")

    # Compute class weights to handle imbalance
    total = sum(class_counts.values())
    class_weight = {}
    class_indices = {"Normal": 0, "Osteopenia": 1, "Osteoporosis": 2}
    for cls, idx in class_indices.items():
        count = class_counts.get(cls, 1)
        class_weight[idx] = total / (3 * count) if count > 0 else 1.0
    print(f"  Class weights: {class_weight}")

    # Data augmentation — aggressive for medical images
    train_datagen = ImageDataGenerator(
        rescale=1./255,
        rotation_range=30,
        width_shift_range=0.15,
        height_shift_range=0.15,
        shear_range=0.1,
        zoom_range=0.2,
        horizontal_flip=True,
        brightness_range=[0.8, 1.2],
        fill_mode="nearest",
        validation_split=0.2
    )
    val_datagen = ImageDataGenerator(rescale=1./255, validation_split=0.2)

    train_gen = train_datagen.flow_from_directory(
        dataset_dir, target_size=IMG_SIZE, batch_size=batch_size,
        class_mode="categorical", subset="training", shuffle=True,
        classes=["Normal", "Osteopenia", "Osteoporosis"]
    )
    val_gen = val_datagen.flow_from_directory(
        dataset_dir, target_size=IMG_SIZE, batch_size=batch_size,
        class_mode="categorical", subset="validation", shuffle=False,
        classes=["Normal", "Osteopenia", "Osteoporosis"]
    )

    if train_gen.samples == 0:
        print("  ! No training images found. Check your dataset structure.")
        return False

    print(f"  Train: {train_gen.samples} images | Val: {val_gen.samples} images")

    # ── Build Model: Pretrained MobileNetV2 ── #
    print("\n  Building MobileNetV2 with pretrained ImageNet weights...")
    base = tf.keras.applications.MobileNetV2(
        input_shape=(224, 224, 3),
        include_top=False,
        weights="imagenet"   # ← THE KEY CHANGE: pretrained weights!
    )

    # Phase 1: Freeze base, train only classifier head
    base.trainable = False
    print(f"  Phase 1: Training classifier head only (base frozen, {len(base.layers)} frozen layers)")

    model = models.Sequential([
        base,
        layers.GlobalAveragePooling2D(),
        layers.BatchNormalization(),
        layers.Dense(256, activation="relu"),
        layers.Dropout(0.5),
        layers.Dense(128, activation="relu"),
        layers.Dropout(0.3),
        layers.Dense(3, activation="softmax")   # Normal / Osteopenia / Osteoporosis
    ])

    model.compile(
        optimizer=optimizers.Adam(learning_rate=1e-3),
        loss="categorical_crossentropy",
        metrics=["accuracy"]
    )
    model.summary()

    callbacks_phase1 = [
        EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True, verbose=1),
        ModelCheckpoint(str(MODELS_DIR / "cnn_model.h5"), save_best_only=True, verbose=1),
        ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=3, min_lr=1e-6, verbose=1),
    ]

    print("\n  Phase 1: Training classifier head (warm-up)...")
    hist1 = model.fit(
        train_gen,
        validation_data=val_gen,
        epochs=min(10, epochs // 2),
        callbacks=callbacks_phase1,
        class_weight=class_weight,
        verbose=1
    )
    phase1_acc = max(hist1.history.get("val_accuracy", [0]))
    print(f"\n  Phase 1 complete. Best val_accuracy: {phase1_acc:.3f}")

    # Phase 2: Unfreeze top layers for fine-tuning
    print(f"\n  Phase 2: Fine-tuning top 30 layers of MobileNetV2...")
    base.trainable = True
    for layer in base.layers[:-30]:
        layer.trainable = False
    trainable_layers = sum(1 for l in base.layers if l.trainable)
    print(f"  Trainable base layers: {trainable_layers} / {len(base.layers)}")

    model.compile(
        optimizer=optimizers.Adam(learning_rate=1e-5),  # Lower LR for fine-tuning
        loss="categorical_crossentropy",
        metrics=["accuracy"]
    )

    callbacks_phase2 = [
        EarlyStopping(monitor="val_loss", patience=6, restore_best_weights=True, verbose=1),
        ModelCheckpoint(str(MODELS_DIR / "cnn_model.h5"), save_best_only=True, verbose=1),
        ReduceLROnPlateau(monitor="val_loss", factor=0.3, patience=3, min_lr=1e-8, verbose=1),
    ]

    remaining_epochs = max(5, epochs - 10)
    hist2 = model.fit(
        train_gen,
        validation_data=val_gen,
        epochs=remaining_epochs,
        callbacks=callbacks_phase2,
        class_weight=class_weight,
        verbose=1
    )
    phase2_acc = max(hist2.history.get("val_accuracy", [0]))
    print(f"\n  Phase 2 complete. Best val_accuracy: {phase2_acc:.3f}")

    # Save class map
    class_map = {v: k for k, v in train_gen.class_indices.items()}
    with open(MODELS_DIR / "cnn_class_map.json", "w") as f:
        json.dump(class_map, f)

    # Remove mock flag if it exists
    mock_flag = MODELS_DIR / "cnn_mock_mode.flag"
    if mock_flag.exists():
        mock_flag.unlink()
        print("  Removed mock mode flag — CNN model will now be used directly")

    print(f"\n  ✔ Model saved to {MODELS_DIR / 'cnn_model.h5'}")
    print(f"  Final best val_accuracy: {max(phase1_acc, phase2_acc):.3f}")
    return True


# ──────────────────────────────────────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────────────────────────────────────

print("=" * 60)
print("  OsteoAI Real X-Ray Training Pipeline")
print("=" * 60)

dataset_dir = None

# 1. Use user-provided dataset
if args.dataset_dir:
    print(f"\n[Dataset] Using provided dataset: {args.dataset_dir}")
    dataset_dir = args.dataset_dir

# 2. Try Kaggle
if not dataset_dir and not args.skip_kaggle:
    raw_dir = try_kaggle_download()
    if raw_dir:
        dataset_dir = prepare_dataset(raw_dir)

# 3. Use improved synthetic data as fallback
if not dataset_dir:
    print("\n[Dataset] Using enhanced synthetic dataset (no real data found).")
    print("  TIP: To use your own X-rays, run:")
    print("    python train_real_xrays.py --dataset-dir /path/to/xray/folder")
    dataset_dir = generate_realistic_synthetic()

if not dataset_dir:
    print("\n✗ Could not create or find a dataset. Exiting.")
    sys.exit(1)

# Train
success = train_model(dataset_dir, epochs=args.epochs, batch_size=args.batch_size)

if success:
    print("\n" + "=" * 60)
    print("  ✅ Training complete!")
    print("  Model saved: backend/models/cnn_model.h5")
    print("  Restart your Flask backend to use the new model.")
    print("=" * 60)
else:
    print("\n✗ Training failed. Check errors above.")
    sys.exit(1)
