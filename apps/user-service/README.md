# User & Access Service

Сервис пользователей, доступа и сессий RP Gant.

Сейчас реализованы:

- HTTP health `/health/live`, `/health/ready`;
- gRPC-сервер на `50051`;
- стандартный `grpc.health.v1.Health` со статусом `SERVING`;
- загрузка контракта `rpgant.user.v1.UserService`;
- auth: `Register`, `VerifyEmail`, `Login`, `ValidateSession`, `Logout`, `LogoutAll`;
- сессии: `RestoreSession`, `ListMySessions`, `RevokeMySession`;
- пароли: `ResendEmailVerification`, `RequestPasswordReset`, `ResetPassword`, `ChangePassword`;
- профиль и пользователи: `GetCurrentUser`, `GetUser`, `UpdateUserProfile`, `ListUsers`, `AdminCreateUser`, `DeleteUser`, `BlockUser`, `UnblockUser`, `GetUsersByIds`;
- `ListUsers` возвращает фактические `global_roles`, включая `GLOBAL_ROLE_APP_ADMIN`;
- роли, права и доступ: `GetRoles`, `GetPermissions`, `GetUserRoles`, `SetUserGlobalRoles`, `GetProjectAccess`, `CheckProjectPermission`, `ListAccessibleProjectIds`, `EnsureProjectOwner`;
- участники проекта: `ListProjectMembers`, `UpdateProjectMemberRole`, `RemoveProjectMember`, `SetProjectOwnerMembership`;
- приглашения: `CreateInvitation`, `ListProjectInvitations`, `ResendInvitation`, `RevokeInvitation`, `AcceptInvitation`;
- исполнители: `CreateExecutor`, `UpdateExecutor`, `DeleteExecutor`, `LinkExecutorUser`, `UnlinkExecutorUser`, `ListExecutors`, `GetExecutorsByIds`;
- настройки: `GetSystemSettings`, `UpdateSystemSettings`;
- контакты и Telegram: `GetNotificationContacts`, `CreateTelegramLinkCode`, `LinkTelegram`, `UnlinkTelegram`;
- PostgreSQL, Argon2id, cookie-сессии, lockout после неудачных попыток;
- `DEV_AUTO_VERIFY=true` для local автоматически подтверждает email при регистрации;
- graceful shutdown HTTP, gRPC и PostgreSQL pool;
- Dockerfile для non-root runtime.

Проверка gRPC-контракта:

```powershell
pnpm test:unit
```

Запуск в Compose:

```powershell
docker compose --env-file infrastructure/local/.env.local `
  --profile infra --profile apps `
  -f infrastructure/local/docker-compose.yml up -d --build user-service
```

gRPC-порт: `localhost:50051`. HTTP health: `http://localhost:8080/health/live` внутри контейнера.
