import urllib.request
import zipfile
import os
import shutil

url = 'https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip'
zip_path = 'small_model.zip'
extract_dir = 'android/app/src/main/assets'
target_model_dir = os.path.join(extract_dir, 'vosk-model')

print(f'Downloading {url}...')
urllib.request.urlretrieve(url, zip_path)
print('Download complete.')

if os.path.exists(target_model_dir):
    print('Removing 130MB model...')
    shutil.rmtree(target_model_dir)

print('Extracting small model...')
with zipfile.ZipFile(zip_path, 'r') as zip_ref:
    zip_ref.extractall(extract_dir)

# The zip extracts to 'vosk-model-small-en-us-0.15'. We need to rename it to 'vosk-model'
extracted_folder = os.path.join(extract_dir, 'vosk-model-small-en-us-0.15')
if os.path.exists(extracted_folder):
    os.rename(extracted_folder, target_model_dir)
    print('Renamed to vosk-model successfully.')

os.remove(zip_path)
print('Done!')
