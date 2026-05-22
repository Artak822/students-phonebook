from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class APIError(Exception):
    code: str = "API_ERROR"
    message: str = "Ошибка"
    http_status: int = 400
    details: dict | None = None

    def __init__(self, message: str | None = None, details: dict | None = None):
        if message is not None:
            self.message = message
        if details is not None:
            self.details = details
        super().__init__(self.message)


class InvalidCredentials(APIError):
    code = "INVALID_CREDENTIALS"
    http_status = 401
    message = "Неверный логин или пароль"


class NotAuthenticated(APIError):
    code = "NOT_AUTHENTICATED"
    http_status = 401
    message = "Необходима авторизация"


class PermissionDenied(APIError):
    code = "PERMISSION_DENIED"
    http_status = 403
    message = "Недостаточно прав"


class PasswordChangeRequired(APIError):
    code = "PASSWORD_CHANGE_REQUIRED"
    http_status = 403
    message = "Необходимо сменить пароль при первом входе"


class EmployeeNotFound(APIError):
    code = "EMPLOYEE_NOT_FOUND"
    http_status = 404
    message = "Студент не найден"


class GroupNotFound(APIError):
    code = "GROUP_NOT_FOUND"
    http_status = 404
    message = "Группа не найдена"


class RoomNotFound(APIError):
    code = "ROOM_NOT_FOUND"
    http_status = 404
    message = "Комната не найдена"


class AdminNotFound(APIError):
    code = "ADMIN_NOT_FOUND"
    http_status = 404
    message = "Администратор не найден"


class RoleNotFound(APIError):
    code = "ROLE_NOT_FOUND"
    http_status = 404
    message = "Роль не найдена"


class GroupHasStudents(APIError):
    code = "GROUP_HAS_STUDENTS"
    http_status = 400
    message = "Нельзя удалить группу, в которой есть студенты"


class RoomHasStudents(APIError):
    code = "ROOM_HAS_STUDENTS"
    http_status = 400
    message = "Нельзя удалить комнату, в которой есть студенты"


class LastSuperAdmin(APIError):
    code = "LAST_SUPER_ADMIN"
    http_status = 400
    message = "Нельзя удалить или разжаловать последнего суперадминистратора"


class SelfDeleteForbidden(APIError):
    code = "SELF_DELETE_FORBIDDEN"
    http_status = 400
    message = "Нельзя удалить свою учётную запись"


class IsSystemRole(APIError):
    code = "IS_SYSTEM_ROLE"
    http_status = 400
    message = "Нельзя изменить или удалить системную роль"


class PhoneAlreadyExists(APIError):
    code = "PHONE_ALREADY_EXISTS"
    http_status = 409
    message = "Студент с таким телефоном уже существует"


class UsernameAlreadyExists(APIError):
    code = "USERNAME_ALREADY_EXISTS"
    http_status = 409
    message = "Администратор с таким именем пользователя уже существует"


class RateLimitExceeded(APIError):
    code = "RATE_LIMIT_EXCEEDED"
    http_status = 429
    message = "Слишком много попыток. Повторите через несколько минут"


class SamePassword(APIError):
    code = "SAME_PASSWORD"
    http_status = 400
    message = "Новый пароль должен отличаться от старого"


class InvalidContentType(APIError):
    code = "INVALID_CONTENT_TYPE"
    http_status = 415
    message = "Ожидается application/json или multipart/form-data"


def _build_response(code: str, message: str, http_status: int, details: dict | None = None) -> JSONResponse:
    body: dict = {"code": code, "message": message}
    if details is not None:
        body["details"] = details
    return JSONResponse(status_code=http_status, content=body)


async def api_error_handler(request: Request, exc: APIError) -> JSONResponse:
    return _build_response(exc.code, exc.message, exc.http_status, exc.details)


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    fields = []
    for error in exc.errors():
        loc = error.get("loc", [])
        field = ".".join(str(p) for p in loc if p != "body")
        fields.append({"field": field, "message": error.get("msg", "")})
    return _build_response("VALIDATION_ERROR", "Невалидные данные", 422, {"fields": fields})


async def internal_error_handler(request: Request, exc: Exception) -> JSONResponse:
    import structlog

    logger = structlog.get_logger()
    request_id = getattr(request.state, "request_id", "unknown")
    logger.error("unhandled_exception", exc_info=True, request_id=request_id)
    return _build_response("INTERNAL_ERROR", "Внутренняя ошибка сервера", 500, {"request_id": request_id})
