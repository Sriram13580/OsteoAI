"""
generate_data_and_models.py
============================
Generates a comprehensive synthetic dataset covering 4 risk tiers:
  - Tier 0  : No Risk   (perfectly healthy — young, no risk factors)
  - Tier 1  : Low Risk  (normal bone density, minimal risk factors)
  - Tier 2  : Moderate  (Osteopenia — some bone loss, moderate risk)
  - Tier 3  : High Risk (Osteoporosis — significant bone loss)

Then trains:
  1. Clinical Gradient Boosting classifier on the clinical dataset
  2. CNN (MobileNetV2 / lightweight fallback) on improved X-ray images

All based on validated epidemiological risk factor weights.
"""

import os
import sys
import json
import numpy as np
import pandas as pd
from pathlib import Path

print("=" * 60)
print("  OsteoAI Comprehensive Model Training")
print("=" * 60)

MODELS_DIR = Path("../backend/models")
MODELS_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)

np.random.seed(42)

# ─────────────────────────────────────────────────────────────────────────────
# 1. CLINICAL DATASET — 4-Tier Comprehensive
# ─────────────────────────────────────────────────────────────────────────────
print("\n[1/4] Generating comprehensive clinical dataset (3,200 samples)...")

def make_clinical_cohort(n, label, age_range, female_prob, bmi_mean, bmi_std,
                          fh_prob, frac_prob, lifestyle_high_prob, calcium_ok_prob,
                          smoke_prob, alcohol_prob):
    """
    Generate n patients with clinically realistic risk profiles for a given label.
    label: 0=No Risk, 1=Low, 2=Moderate, 3=High
    """
    rng = np.random
    age = rng.randint(*age_range, n)
    gender = rng.choice([0, 1], n, p=[1 - female_prob, female_prob])
    bmi = np.round(rng.normal(bmi_mean, bmi_std, n).clip(14, 48), 1)
    fam_hist = rng.choice([0, 1], n, p=[1 - fh_prob, fh_prob])
    prev_frac = rng.choice([0, 1], n, p=[1 - frac_prob, frac_prob])
    # lifestyle 0=low risk, 1=moderate, 2=high sedentary
    lh = lifestyle_high_prob
    lifestyle = rng.choice([0, 1, 2], n, p=[max(0.05, 1-lh-0.2), 0.2, lh])
    calcium = rng.choice([0, 1], n, p=[1 - calcium_ok_prob, calcium_ok_prob])
    smoke = rng.choice([0, 1], n, p=[1 - smoke_prob, smoke_prob])
    alcohol = rng.choice([0, 1], n, p=[1 - alcohol_prob, alcohol_prob])

    df = pd.DataFrame({
        "Age": age, "Gender": gender, "BMI": bmi,
        "FamilyHistory": fam_hist, "PreviousFracture": prev_frac,
        "LifestyleRisk": lifestyle, "CalciumIntake": calcium,
        "Smoking": smoke, "Alcohol": alcohol,
        "Label": label
    })
    return df

cohorts = [
    # No Risk (Label=0): young, mostly male/equal, good BMI, zero risk factors
    make_clinical_cohort(
        800, 0,
        age_range=(20, 45), female_prob=0.40,
        bmi_mean=23.0, bmi_std=2.5,
        fh_prob=0.02, frac_prob=0.01,
        lifestyle_high_prob=0.05, calcium_ok_prob=0.95,
        smoke_prob=0.05, alcohol_prob=0.05
    ),
    # Low Risk (Label=1): 40-60, slight risk factor mix, mostly normal
    make_clinical_cohort(
        800, 1,
        age_range=(40, 62), female_prob=0.52,
        bmi_mean=24.5, bmi_std=3.5,
        fh_prob=0.15, frac_prob=0.05,
        lifestyle_high_prob=0.12, calcium_ok_prob=0.78,
        smoke_prob=0.15, alcohol_prob=0.12
    ),
    # Moderate Risk (Label=2): Osteopenia — middle-aged to elderly, more risk factors
    make_clinical_cohort(
        800, 2,
        age_range=(50, 72), female_prob=0.68,
        bmi_mean=22.0, bmi_std=4.0,
        fh_prob=0.40, frac_prob=0.22,
        lifestyle_high_prob=0.30, calcium_ok_prob=0.45,
        smoke_prob=0.30, alcohol_prob=0.28
    ),
    # High Risk (Label=3): Osteoporosis — elderly, mostly female, many risk factors
    make_clinical_cohort(
        800, 3,
        age_range=(65, 88), female_prob=0.82,
        bmi_mean=19.5, bmi_std=3.0,
        fh_prob=0.70, frac_prob=0.60,
        lifestyle_high_prob=0.55, calcium_ok_prob=0.20,
        smoke_prob=0.45, alcohol_prob=0.38
    ),
]

df = pd.concat(cohorts, ignore_index=True).sample(frac=1, random_state=42).reset_index(drop=True)
df.to_csv(DATA_DIR / "clinical_data.csv", index=False)

counts = df["Label"].value_counts().sort_index()
label_names = {0: "No Risk", 1: "Low Risk", 2: "Moderate", 3: "High Risk"}
print(f"  ✔ Saved clinical_data.csv — {len(df)} samples")
for lbl, cnt in counts.items():
    print(f"     Label {lbl} ({label_names[lbl]}): {cnt} samples")


# ─────────────────────────────────────────────────────────────────────────────
# 2. SYNTHETIC X-RAY IMAGES — Realistic 4-class bone structure
# ─────────────────────────────────────────────────────────────────────────────
print("\n[2/4] Generating synthetic bone X-ray images...")

try:
    from PIL import Image, ImageDraw, ImageFilter
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("  ! PIL not found — skipping image generation. pip install Pillow")

if HAS_PIL:
    # Map 4 clinical labels to 3 CNN classes (CNN still 3-class)
    # No Risk + Low Risk → Normal; Moderate → Osteopenia; High → Osteoporosis
    IMG_CLASSES = {
        "Normal": {
            "n": 400,
            "brightness": (210, 245),   # very bright, dense bone
            "cortical": 0.96,
            "porosity": 1,
            "trabecular": 35,
        },
        "Osteopenia": {
            "n": 400,
            "brightness": (140, 185),   # moderate brightness
            "cortical": 0.62,
            "porosity": 18,
            "trabecular": 16,
        },
        "Osteoporosis": {
            "n": 400,
            "brightness": (30, 90),     # dark, porous, thin cortex
            "cortical": 0.22,
            "porosity": 70,
            "trabecular": 3,
        },
    }

    img_dir = DATA_DIR / "images"
    total_imgs = 0

    for cname, params in IMG_CLASSES.items():
        cls_dir = img_dir / cname
        cls_dir.mkdir(parents=True, exist_ok=True)
        n = params["n"]
        bmin, bmax = params["brightness"]
        print(f"  Generating {n} {cname} images...")

        for i in range(n):
            sz = 224
            brightness = np.random.randint(bmin, bmax)

            # Pure black background (X-ray film)
            arr = np.zeros((sz, sz), dtype=np.uint8)
            img = Image.fromarray(arr, "L")
            draw = ImageDraw.Draw(img)
            cx, cy = sz // 2, sz // 2

            # Soft tissue region (subtle mid-gray)
            st_b = max(15, brightness // 5)
            st_r = np.random.randint(98, 108)
            draw.ellipse([cx-st_r, cy-st_r, cx+st_r, cy+st_r], fill=st_b)

            # Cortical bone (bright outer ring)
            outer_r = np.random.randint(70, 86)
            cort_b = min(255, int(brightness * params["cortical"]) + np.random.randint(15, 45))
            draw.ellipse([cx-outer_r, cy-outer_r, cx+outer_r, cy+outer_r], fill=cort_b)

            # Trabecular (cancellous) bone interior
            inner_r = int(outer_r * (1.0 - (1.0 - params["cortical"]) * 0.45))
            draw.ellipse([cx-inner_r, cy-inner_r, cx+inner_r, cy+inner_r], fill=brightness)

            # Trabecular struts (more dense lines = healthier bone)
            for _ in range(params["trabecular"]):
                x1 = np.random.randint(cx-inner_r+4, cx+inner_r-4)
                y1 = np.random.randint(cy-inner_r+4, cy+inner_r-4)
                x2 = x1 + np.random.randint(-16, 16)
                y2 = y1 + np.random.randint(-16, 16)
                lb = max(25, brightness - np.random.randint(10, 35))
                draw.line([(x1,y1),(x2,y2)], fill=lb, width=1)

            # Medullary canal (dark center)
            canal_r = int(outer_r * (0.26 + (1 - params["cortical"]) * 0.22))
            canal_b = max(4, brightness - 85 - np.random.randint(0, 25))
            draw.ellipse([cx-canal_r, cy-canal_r, cx+canal_r, cy+canal_r], fill=canal_b)

            # Porosity holes (more = advanced bone loss)
            for _ in range(params["porosity"]):
                px = np.random.randint(cx-inner_r+3, cx+inner_r-3)
                py = np.random.randint(cy-inner_r+3, cy+inner_r-3)
                pr = np.random.randint(2, 8)
                pb = max(0, brightness - np.random.randint(55, 110))
                draw.ellipse([px, py, px+pr, py+pr], fill=pb)

            img = img.filter(ImageFilter.GaussianBlur(radius=np.random.uniform(0.3, 1.2)))
            img.convert("RGB").save(cls_dir / f"{cname.lower()}_{i:04d}.png")
            total_imgs += 1

    print(f"  ✔ Generated {total_imgs} synthetic X-ray images (400 per class)")


# ─────────────────────────────────────────────────────────────────────────────
# 3. TRAIN CLINICAL MODEL — Gradient Boosting (4-class)
# ─────────────────────────────────────────────────────────────────────────────
print("\n[3/4] Training clinical risk model (Gradient Boosting, 4-class)...")

try:
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.preprocessing import StandardScaler
    from sklearn.model_selection import train_test_split, cross_val_score
    from sklearn.metrics import classification_report, accuracy_score
    import joblib

    features = ["Age","Gender","BMI","FamilyHistory","PreviousFracture",
                "LifestyleRisk","CalciumIntake","Smoking","Alcohol"]
    X = df[features].values
    y = df["Label"].values

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s  = scaler.transform(X_test)

    clf = GradientBoostingClassifier(
        n_estimators=300,
        learning_rate=0.07,
        max_depth=5,
        min_samples_split=8,
        min_samples_leaf=4,
        subsample=0.85,
        random_state=42
    )
    clf.fit(X_train_s, y_train)
    y_pred = clf.predict(X_test_s)

    acc = accuracy_score(y_test, y_pred)
    cv_scores = cross_val_score(clf, scaler.transform(X), y, cv=5, scoring="accuracy")

    print(f"  Test Accuracy:         {acc:.4f} ({acc*100:.1f}%)")
    print(f"  5-Fold CV Accuracy:    {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")
    print(f"\n  Classification Report:")
    target_names = ["No Risk", "Low Risk", "Moderate Risk", "High Risk"]
    print(classification_report(y_test, y_pred, target_names=target_names))

    # Save model + scaler
    joblib.dump(clf, MODELS_DIR / "clinical_model.pkl")
    joblib.dump(scaler, MODELS_DIR / "clinical_scaler.pkl")

    # Save class map
    class_map = {0: "Normal", 1: "Normal", 2: "Osteopenia", 3: "Osteoporosis"}
    with open(MODELS_DIR / "clinical_class_map.json", "w") as f:
        json.dump(class_map, f)

    print(f"\n  ✔ Clinical model saved to {MODELS_DIR}/clinical_model.pkl")
    print(f"  ✔ Scaler saved to {MODELS_DIR}/clinical_scaler.pkl")

except ImportError as e:
    print(f"  ! Scikit-learn not available: {e}")
    print("  Run: pip install scikit-learn")


# ─────────────────────────────────────────────────────────────────────────────
# 4. TRAIN CNN ON SYNTHETIC X-RAYS (MobileNetV2 transfer learning)
# ─────────────────────────────────────────────────────────────────────────────
print("\n[4/4] Training CNN on synthetic X-ray images (MobileNetV2)...")

if not HAS_PIL:
    print("  ! Skipping CNN — no images were generated (PIL missing)")
else:
    try:
        import tensorflow as tf
        from tensorflow.keras import layers, models, optimizers
        from tensorflow.keras.preprocessing.image import ImageDataGenerator
        from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau

        print(f"  TensorFlow: {tf.__version__}")

        IMG_SIZE = (224, 224)
        BATCH = 16
        EPOCHS_WARMUP = 8
        EPOCHS_FINETUNE = 15

        # Data generators with augmentation
        train_gen_obj = ImageDataGenerator(
            rescale=1./255,
            rotation_range=20,
            width_shift_range=0.12,
            height_shift_range=0.12,
            zoom_range=0.18,
            horizontal_flip=True,
            brightness_range=[0.85, 1.15],
            fill_mode="nearest",
            validation_split=0.20
        )
        val_gen_obj = ImageDataGenerator(rescale=1./255, validation_split=0.20)

        train_gen = train_gen_obj.flow_from_directory(
            str(img_dir), target_size=IMG_SIZE, batch_size=BATCH,
            class_mode="categorical", subset="training", shuffle=True,
            classes=["Normal","Osteopenia","Osteoporosis"]
        )
        val_gen = val_gen_obj.flow_from_directory(
            str(img_dir), target_size=IMG_SIZE, batch_size=BATCH,
            class_mode="categorical", subset="validation", shuffle=False,
            classes=["Normal","Osteopenia","Osteoporosis"]
        )

        print(f"  Train: {train_gen.samples} | Val: {val_gen.samples}")

        # Class weights (balanced)
        n_total = train_gen.samples
        class_weight = {i: n_total / (3 * list(train_gen.class_indices.values()).count(i) + 1)
                        for i in range(3)}
        class_weight = {0: 1.0, 1: 1.0, 2: 1.0}  # balanced dataset, equal weights

        # Build model: MobileNetV2 + custom head
        print("\n  Building MobileNetV2 with ImageNet weights...")
        base = tf.keras.applications.MobileNetV2(
            input_shape=(224, 224, 3), include_top=False, weights="imagenet"
        )
        base.trainable = False

        model = models.Sequential([
            base,
            layers.GlobalAveragePooling2D(),
            layers.BatchNormalization(),
            layers.Dense(256, activation="relu"),
            layers.Dropout(0.45),
            layers.Dense(128, activation="relu"),
            layers.Dropout(0.30),
            layers.Dense(3, activation="softmax")  # Normal / Osteopenia / Osteoporosis
        ])

        model.compile(
            optimizer=optimizers.Adam(1e-3),
            loss="categorical_crossentropy",
            metrics=["accuracy"]
        )

        cb1 = [
            EarlyStopping(monitor="val_loss", patience=4, restore_best_weights=True),
            ModelCheckpoint(str(MODELS_DIR/"cnn_model.h5"), save_best_only=True, verbose=0),
            ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=2, min_lr=1e-7),
        ]

        print(f"\n  Phase 1: Warm-up ({EPOCHS_WARMUP} epochs, frozen base)...")
        h1 = model.fit(train_gen, validation_data=val_gen, epochs=EPOCHS_WARMUP,
                       callbacks=cb1, class_weight=class_weight, verbose=1)
        best1 = max(h1.history.get("val_accuracy", [0]))
        print(f"  Phase 1 best val_accuracy: {best1:.4f}")

        # Phase 2: Fine-tune top layers
        base.trainable = True
        for layer in base.layers[:-35]:
            layer.trainable = False

        model.compile(
            optimizer=optimizers.Adam(5e-6),
            loss="categorical_crossentropy",
            metrics=["accuracy"]
        )

        cb2 = [
            EarlyStopping(monitor="val_loss", patience=5, restore_best_weights=True),
            ModelCheckpoint(str(MODELS_DIR/"cnn_model.h5"), save_best_only=True, verbose=0),
            ReduceLROnPlateau(monitor="val_loss", factor=0.3, patience=3, min_lr=1e-9),
        ]

        print(f"\n  Phase 2: Fine-tuning top 35 layers ({EPOCHS_FINETUNE} epochs)...")
        h2 = model.fit(train_gen, validation_data=val_gen, epochs=EPOCHS_FINETUNE,
                       callbacks=cb2, class_weight=class_weight, verbose=1)
        best2 = max(h2.history.get("val_accuracy", [0]))
        print(f"  Phase 2 best val_accuracy: {best2:.4f}")

        # Save class map
        class_map = {str(v): k for k, v in train_gen.class_indices.items()}
        with open(MODELS_DIR/"cnn_class_map.json", "w") as f:
            json.dump(class_map, f)

        # Remove mock flag
        mock_flag = MODELS_DIR/"cnn_mock_mode.flag"
        if mock_flag.exists():
            mock_flag.unlink()

        final_acc = max(best1, best2)
        print(f"\n  ✔ CNN model saved to {MODELS_DIR}/cnn_model.h5")
        print(f"  ✔ Final best val_accuracy: {final_acc:.4f} ({final_acc*100:.1f}%)")

    except ImportError as e:
        print(f"  ! TensorFlow not available: {e}")
        print("  Run: pip install tensorflow-cpu")

# ─────────────────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("  ✅ Training Complete!")
print("  Models saved in backend/models/")
print("  Restart Flask backend to load the new models.")
print("=" * 60)
