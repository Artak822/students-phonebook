import io
import uuid

import aioboto3
from botocore.exceptions import ClientError

from app.config import settings

_session = aioboto3.Session(
    aws_access_key_id=settings.S3_ACCESS_KEY,
    aws_secret_access_key=settings.S3_SECRET_KEY,
)


def _client():
    return _session.client("s3", endpoint_url=settings.S3_ENDPOINT)


async def upload_object(key: str, data: bytes, content_type: str = "image/jpeg") -> None:
    async with _client() as s3:
        await s3.put_object(
            Bucket=settings.S3_BUCKET,
            Key=key,
            Body=data,
            ContentType=content_type,
        )


async def delete_object(key: str) -> None:
    async with _client() as s3:
        try:
            await s3.delete_object(Bucket=settings.S3_BUCKET, Key=key)
        except ClientError:
            pass


async def stream_object(key: str):
    """Yields chunks of the object body."""
    async with _client() as s3:
        response = await s3.get_object(Bucket=settings.S3_BUCKET, Key=key)
        data = await response["Body"].read()
        yield data


async def generate_presigned_url(key: str, expires_in: int = 300) -> str:
    """Возвращает presigned GET-URL с ограниченным временем жизни (по умолчанию 5 минут)."""
    async with _client() as s3:
        url = await s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.S3_BUCKET, "Key": key},
            ExpiresIn=expires_in,
        )
    return url


def make_photo_key(emp_id: int) -> str:
    # emp_id не включается в имя файла — только для организации префикса
    return f"photos/{uuid.uuid4()}.jpg"
