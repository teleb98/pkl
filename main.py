import os
import io
import time
from google.api_core.exceptions import GoogleAPIError
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload, MediaFileUpload
from google.cloud import vision
from google.cloud import storage

# ==========================================
# [설정 항목] 본인의 환경에 맞게 수정하세요.
# ==========================================
CREDENTIALS_PATH = "credentials.json"
GCS_BUCKET_NAME  = "your-gcs-bucket-name"       # ← GCS 버킷명으로 변경
SOURCE_FILE_ID   = "YOUR_DRIVE_FILE_ID_HERE"     # ← Drive PDF 파일 ID로 변경
TARGET_FOLDER_ID = "YOUR_DRIVE_FOLDER_ID_HERE"   # ← 결과 저장 폴더 ID로 변경
# ==========================================

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath(CREDENTIALS_PATH)


def get_drive_service():
    creds = service_account.Credentials.from_service_account_file(
        CREDENTIALS_PATH, scopes=["https://www.googleapis.com/auth/drive"]
    )
    return build("drive", "v3", credentials=creds)


def download_from_drive(drive_service, file_id, local_path):
    print(f"[*] 구글 드라이브에서 파일(ID: {file_id}) 다운로드 시작...")
    request = drive_service.files().get_media(fileId=file_id)
    with open(local_path, "wb") as f:
        downloader = MediaIoBaseDownload(f, request, chunksize=10 * 1024 * 1024)
        done = False
        while not done:
            status, done = downloader.next_chunk()
            print(f"    - 다운로드 진행률: {int(status.progress() * 100)}%")
    print(f"[+] 다운로드 완료: {local_path}")


def upload_to_gcs(local_path, bucket_name, gcs_blob_name):
    print(f"[*] GCS 버킷({bucket_name})으로 파일 업로드 중...")
    storage_client = storage.Client()
    bucket = storage_client.bucket(bucket_name)
    blob = bucket.blob(gcs_blob_name)
    blob.upload_from_filename(local_path)
    print(f"[+] GCS 업로드 완료: gs://{bucket_name}/{gcs_blob_name}")


def async_ocr_pdf(gcs_source_uri, gcs_destination_uri):
    print("[*] Cloud Vision API 비동기 배치 OCR 요청 중...")
    client = vision.ImageAnnotatorClient()

    input_config = vision.InputConfig(
        gcs_source=vision.GcsSource(uri=gcs_source_uri),
        mime_type="application/pdf",
    )
    output_config = vision.OutputConfig(
        gcs_destination=vision.GcsDestination(uri=gcs_destination_uri),
        batch_size=100,
    )
    async_request = vision.AsyncAnnotateFileRequest(
        features=[vision.Feature(type_=vision.Feature.Type.DOCUMENT_TEXT_DETECTION)],
        input_config=input_config,
        output_config=output_config,
    )

    operation = client.async_batch_annotate_files(requests=[async_request])
    print("    - 대용량 PDF 분석 중... (수 분이 소요될 수 있습니다)")
    operation.result(timeout=1800)
    print("[+] Cloud Vision API OCR 분석 및 GCS 저장 완료.")


def parse_ocr_results_from_gcs(bucket_name, prefix):
    print("[*] GCS에서 OCR 결과 JSON 취합 및 텍스트 추출 중...")
    storage_client = storage.Client()
    bucket = storage_client.get_bucket(bucket_name)
    blob_list = list(bucket.list_blobs(prefix=prefix))

    full_text = ""
    for blob in sorted(blob_list, key=lambda b: b.name):
        if not blob.name.endswith(".json"):
            continue
        json_string = blob.download_as_bytes().decode("utf-8")
        response = vision.AnnotateFileResponse.from_json(
            json_string, ignore_unknown_fields=True
        )
        for page_response in response.responses:
            text = page_response.full_text_annotation.text
            if text:
                full_text += text + "\n"
    return full_text


def upload_to_drive(drive_service, local_path, folder_id, file_name):
    print(f"[*] 구글 드라이브(폴더 ID: {folder_id})로 최종 결과 업로드 중...")
    file_metadata = {"name": file_name, "parents": [folder_id]}
    media = MediaFileUpload(local_path, mimetype="text/plain", resumable=True)
    file = (
        drive_service.files()
        .create(body=file_metadata, media_body=media, fields="id")
        .execute()
    )
    print(f"[+] 구글 드라이브 업로드 성공! 파일 ID: {file.get('id')}")


def main():
    drive_service = get_drive_service()

    local_pdf        = "temp_download.pdf"
    local_result_txt = "ocr_result.txt"
    gcs_pdf_name     = "large_input.pdf"
    gcs_output_prefix = "ocr_output_json/"

    try:
        download_from_drive(drive_service, SOURCE_FILE_ID, local_pdf)
        upload_to_gcs(local_pdf, GCS_BUCKET_NAME, gcs_pdf_name)

        gcs_source_uri      = f"gs://{GCS_BUCKET_NAME}/{gcs_pdf_name}"
        gcs_destination_uri = f"gs://{GCS_BUCKET_NAME}/{gcs_output_prefix}"
        async_ocr_pdf(gcs_source_uri, gcs_destination_uri)

        extracted_text = parse_ocr_results_from_gcs(GCS_BUCKET_NAME, gcs_output_prefix)

        with open(local_result_txt, "w", encoding="utf-8") as f:
            f.write(extracted_text)

        upload_to_drive(
            drive_service, local_result_txt,
            TARGET_FOLDER_ID, "[OCR_Result]_Extracted_Text.txt"
        )

    except GoogleAPIError as ge:
        print(f"[-] 구글 클라우드 API 오류 발생: {ge}")
    except Exception as e:
        print(f"[-] 알 수 없는 오류 발생: {e}")
    finally:
        for f in (local_pdf, local_result_txt):
            if os.path.exists(f):
                os.remove(f)
        print("[*] 프로세스 완료 — 임시 파일 정리됨.")


if __name__ == "__main__":
    main()
