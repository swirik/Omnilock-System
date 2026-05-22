import os
import cv2
import numpy as np
import face_recognition
import requests
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

KNOWN_FACES_DIR = "known_faces"
if not os.path.exists(KNOWN_FACES_DIR):
    os.makedirs(KNOWN_FACES_DIR)

known_encodings = []
known_names = []

def load_existing_faces():
    global known_encodings, known_names
    known_encodings = []
    known_names = []
    for filename in os.listdir(KNOWN_FACES_DIR):
        if filename.endswith(('.jpg', '.jpeg', '.png')):
            name = os.path.splitext(filename)[0]
            image = face_recognition.load_image_file(os.path.join(KNOWN_FACES_DIR, filename))
            encodings = face_recognition.face_encodings(image)
            if encodings:
                known_encodings.append(encodings[0])
                known_names.append(name)

load_existing_faces()

@app.route('/api/profiles', methods=['GET'])
def get_profiles():
    return jsonify({"profiles": known_names})

@app.route('/api/profiles/<face_id>', methods=['DELETE'])
def delete_profile(face_id):
    global known_encodings, known_names
    if face_id in known_names:
        index = known_names.index(face_id)
        known_encodings.pop(index)
        known_names.pop(index)
        file_path = os.path.join(KNOWN_FACES_DIR, f"{face_id}.jpg")
        if os.path.exists(file_path):
            os.remove(file_path)
        return jsonify({"status": "success"})
    return jsonify({"status": "fail"}), 404

@app.route('/api/image/<face_id>', methods=['GET'])
def get_image(face_id):
    filename = f"{face_id}.jpg"
    if os.path.exists(os.path.join(KNOWN_FACES_DIR, filename)):
        return send_from_directory(KNOWN_FACES_DIR, filename)
    return jsonify({"error": "Not found"}), 404

@app.route('/api/enroll', methods=['POST'])
def enroll():
    if len(known_names) >= 4:
        return jsonify({"status": "fail", "message": "MAX_FACES_REACHED"})

    file_bytes = request.data
    npimg = np.frombuffer(file_bytes, np.uint8)
    img = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
    rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    
    face_locations = face_recognition.face_locations(rgb_img)
    face_encodings = face_recognition.face_encodings(rgb_img, face_locations)
    
    if not face_encodings:
        return jsonify({"status": "fail", "message": "NO_FACE"})
    
    new_user_id = f"User_{len(known_names) + 1}"
    file_path = os.path.join(KNOWN_FACES_DIR, f"{new_user_id}.jpg")
    cv2.imwrite(file_path, img)
    
    known_encodings.append(face_encodings[0])
    known_names.append(new_user_id)
    
    requests.post("http://127.0.0.1:3000/api/verify-face", json={"status": "enroll_success", "faceId": new_user_id})
    
    return jsonify({"status": "success", "message": "ENROLL_SUCCESS"})

@app.route('/api/recognize', methods=['POST'])
def recognize():
    file_bytes = request.data
    npimg = np.frombuffer(file_bytes, np.uint8)
    img = cv2.imdecode(npimg, cv2.IMREAD_COLOR)
    rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    
    face_locations = face_recognition.face_locations(rgb_img)
    
    if not face_locations:
        return jsonify({"status": "fail", "message": "NO_FACE", "faceId": "none"})
        
    face_encodings = face_recognition.face_encodings(rgb_img, face_locations)
    
    matches = face_recognition.compare_faces(known_encodings, face_encodings[0])
    if True in matches:
        first_match_index = matches.index(True)
        name = known_names[first_match_index]
        requests.post("http://127.0.0.1:3000/api/verify-face", json={"status": "success", "faceId": name})
        return jsonify({"status": "success", "message": "FACE_FOUND", "faceId": name})
    
    requests.post("http://127.0.0.1:3000/api/verify-face", json={"status": "fail", "faceId": "unknown"})
    return jsonify({"status": "fail", "message": "UNKNOWN_FACE", "faceId": "unknown"})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)