# Panel API SUNAT (frontend) — despliegue en Coolify

Imagen: Angular (`ng build --configuration production`) + nginx. Solo reenvía `/api/admin/` a `sunat-api:8081` (nada de `/api/v1`, `/api/portal` ni `/actuator`). **Es un panel interno:** restringir el dominio por IP o VPN. Su dominio va en `ADMIN_ALLOWED_ORIGINS` de la API SUNAT (solo hace falta si se llama desde otro origen; por `/api` en el mismo dominio no hay CORS).

## 1. Requisitos
- El **backend de este frontend ya desplegado**: crea la red compartida `sunat-prod` (variable `SUNAT_SHARED_NETWORK` del backend; QA y producción
  en el mismo servidor usan nombres distintos) con el alias de la API. Sin ella, este recurso no arranca ("network ... not found").
- Dominio con DNS apuntando al servidor de Coolify.

## 2. Crear el recurso en Coolify
1. *New Resource* → repositorio de este frontend → build pack **Docker Compose**.
2. *Base Directory* `/` · *Docker Compose Location* `/docker-compose.coolify.yml` · rama `deploy-prod` (o `deploy-qa`).
3. *Environment Variables*: `SUNAT_SHARED_NETWORK` = `sunat-prod` (o el nombre que usó el backend; para QA, el de QA). Ninguna otra: el frontend no lleva secretos.
4. *Domains*: en el servicio `web` poner `https://dominio:80` (el `:80` es el puerto interno de nginx; Coolify emite el certificado).
5. *Deploy*.

## 3. Despliegue automático
`.github/workflows/deploy-prod.yml` y `deploy-qa.yml` llaman al webhook de Coolify al hacer push a `deploy-prod` / `deploy-qa`.
Secretos del repositorio: `COOLIFY_PROD_URL`, `COOLIFY_PROD_TOKEN`, `COOLIFY_QA_URL`, `COOLIFY_QA_TOKEN` (*Resource* → *Webhooks* →
*Deploy Webhook* y un token de la API de Coolify).

## 4. Comprobar
- `https://dominio/` carga la SPA y `https://dominio/api/...` llega a la API (sin CORS). Si responde 502, el alias de la API no está
  en la red: revisar que el backend esté arriba y que `SUNAT_SHARED_NETWORK` coincida.
- Cabeceras: `curl -sI https://dominio/ | grep -i "content-security\|strict-transport"`.
- Probar la compilación y la imagen en local: `docker build -t api-sunat-frontend .`
