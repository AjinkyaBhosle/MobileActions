import urllib.request
import zipfile
import os
import shutil

url = 'https://alphacephei.com/vosk/models/vosk-model-en-us-0.22-lgraph.zip'
zip_path = 'model.zip'
extract_dir = 'android/app/src/main/assets'
target_model_dir = os.path.join(extract_dir, 'vosk-model')

print(f'Downloading {url}...')
urllib.request.urlretrieve(url, zip_path)
print('Download complete.')

if os.path.exists(target_model_dir):
    print('Removing old model...')
    shutil.rmtree(target_model_dir)

print('Extracting zip...')
with zipfile.ZipFile(zip_path, 'r') as zip_ref:
    zip_ref.extractall(extract_dir)

# The zip extracts to 'vosk-model-en-us-0.22-lgraph'. We need to rename it to 'vosk-model'
extracted_folder = os.path.join(extract_dir, 'vosk-model-en-us-0.22-lgraph')
if os.path.exists(extracted_folder):
    os.rename(extracted_folder, target_model_dir)
    print('Renamed to vosk-model successfully.')

os.remove(zip_path)
print('Done!')
