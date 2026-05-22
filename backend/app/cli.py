import asyncio
import getpass

import typer

cli = typer.Typer(help="АСПиРС CRM — утилиты командной строки")


@cli.command()
def create_superadmin(
    username: str = typer.Option(..., "--username", help="Имя пользователя суперадминистратора"),
):
    """Создать первого суперадминистратора. Пароль вводится интерактивно."""
    asyncio.run(_create_superadmin(username))


async def _create_superadmin(username: str) -> None:
    from sqlalchemy import select

    from app.admins.models import Admin
    from app.core.security import hash_password
    from app.database import AsyncSessionLocal
    from app.roles.models import Role

    password = getpass.getpass("Пароль: ")
    confirm = getpass.getpass("Подтвердите пароль: ")

    if password != confirm:
        typer.echo("Ошибка: пароли не совпадают", err=True)
        raise typer.Exit(1)

    if len(password) < 8:
        typer.echo("Ошибка: пароль должен содержать не менее 8 символов", err=True)
        raise typer.Exit(1)

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Role).where(Role.name == "super_admin"))
        role = result.scalar_one_or_none()
        if role is None:
            typer.echo(
                "Ошибка: системные роли не найдены. Запустите: alembic upgrade head",
                err=True,
            )
            raise typer.Exit(1)

        existing = await session.execute(select(Admin).where(Admin.username == username))
        if existing.scalar_one_or_none() is not None:
            typer.echo(f"Ошибка: администратор «{username}» уже существует", err=True)
            raise typer.Exit(1)

        admin = Admin(
            username=username,
            password_hash=hash_password(password),
            fio=username,
            role_id=role.id,
            is_active=True,
            password_changed=True,
        )
        session.add(admin)
        await session.commit()

    typer.echo(f"Суперадминистратор «{username}» успешно создан.")


if __name__ == "__main__":
    cli()
