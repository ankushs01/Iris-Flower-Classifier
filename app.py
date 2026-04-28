from flask import Flask, render_template, request, jsonify
import joblib
import pandas as pd
import os
import io
import csv

app = Flask(__name__)

# ── Load model ─────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "iris_classifier_model.joblib")

try:
    model = joblib.load(MODEL_PATH)
    print(f"✅ Model loaded from {MODEL_PATH}")
except FileNotFoundError:
    model = None
    print(f"⚠️ Model not found at {MODEL_PATH}")

# Must match training feature order exactly
FEATURE_NAMES = [
    "sepal length (cm)",
    "sepal width (cm)",
    "petal length (cm)",
    "petal width (cm)",
]

# 🔥 FORCE mapping from numeric class → species name
SPECIES_MAP = {
    0: "Iris Setosa",
    1: "Iris Versicolor",
    2: "Iris Virginica"
}


# ── Helper Functions ──────────────────────────────────────────────────────
def to_python(val):
    return val.item() if hasattr(val, "item") else val


def label_to_name(raw):
    val = to_python(raw)

    # If prediction is numeric (0,1,2)
    if isinstance(val, (int, float)):
        return SPECIES_MAP.get(int(val), f"Class {val}")

    # If prediction is already string
    name = str(val).replace("-", " ").replace("_", " ").strip().title()
    if not name.lower().startswith("iris"):
        name = "Iris " + name

    return name


def make_df(values):
    return pd.DataFrame([values], columns=FEATURE_NAMES)


def get_proba(df):
    if not hasattr(model, "predict_proba"):
        return None

    try:
        probs = model.predict_proba(df)[0]
        classes = model.classes_

        results = {}
        for cls, prob in zip(classes, probs):
            name = label_to_name(cls)
            results[name] = round(float(prob) * 100, 1)

        return results

    except Exception:
        return None


def _is_float(s):
    try:
        float(s)
        return True
    except (ValueError, TypeError):
        return False


# ── Routes ─────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/predict", methods=["POST"])
def predict():
    if model is None:
        return jsonify({"error": "Model file not found."}), 500

    data = request.get_json()

    try:
        features = [
            float(data["sepal_length"]),
            float(data["sepal_width"]),
            float(data["petal_length"]),
            float(data["petal_width"]),
        ]
    except (KeyError, ValueError, TypeError):
        return jsonify({"error": "Provide four valid numeric inputs."}), 400

    df = make_df(features)

    raw_prediction = model.predict(df)[0]
    species_name = label_to_name(raw_prediction)
    probabilities = get_proba(df)

    return jsonify({
        "species": species_name,
        "probabilities": probabilities
    })


@app.route("/predict_csv", methods=["POST"])
def predict_csv():
    if model is None:
        return jsonify({"error": "Model not found."}), 500

    file = request.files.get("file")
    if not file or not file.filename.endswith(".csv"):
        return jsonify({"error": "Upload a valid .csv file."}), 400

    content = file.read().decode("utf-8")
    reader = csv.reader(io.StringIO(content))
    rows = list(reader)

    start = 1 if rows and not _is_float(rows[0][0]) else 0

    results = []

    for i, row in enumerate(rows[start:], start=1):
        try:
            values = [float(v) for v in row[:4]]
        except (ValueError, IndexError):
            continue

        df = make_df(values)
        raw_prediction = model.predict(df)[0]
        species_name = label_to_name(raw_prediction)

        results.append({
            "row": i,
            "species": species_name
        })

    if not results:
        return jsonify({"error": "No valid numeric rows found."}), 400

    return jsonify({
        "results": results,
        "total_predictions": len(results)
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)