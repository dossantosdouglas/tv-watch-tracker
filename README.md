# TV Watch Tracker (Android TV Listener)

App em segundo plano para **Android TV (Hisense SmartTV 4K FFM, Android 12 / SDK 31)** que monitora automaticamente o que está sendo assistido no **Crunchyroll** e no **YouCine** e envia eventos via HTTP (`POST` JSON) para um servidor próprio.

## Objetivo

1. Rodar de forma silenciosa em segundo plano na TV (`ForegroundService` + `AccessibilityService` + `NotificationListenerService` / `MediaSessionManager`).
2. Detectar automaticamente:
   - App ativo (`com.crunchyroll.crunchyroid` ou `com.world.youcinetv`)
   - Nome da série / anime / filme
   - Temporada e episódio (quando aplicável)
   - Tempo atual / duração (quando disponível)
   - Timestamp do evento
3. Fazer *debounce* / controle de sessão para não enviar eventos repetidos a cada segundo.
4. Enviar payload JSON para o servidor configurado (para posterior persistência em banco de dados).

## Arquitetura Recomendada (Android / Kotlin)

- **`WatchAccessibilityService` (`AccessibilityService`)**:
  - Escuta `TYPE_WINDOW_STATE_CHANGED` e `TYPE_WINDOW_CONTENT_CHANGED` filtrando os pacotes `com.crunchyroll.crunchyroid` e `com.world.youcinetv`.
  - Lê a árvore de UI (`rootInActiveWindow` com `flagIncludeNotImportantViews`) buscando os IDs mapeados em [DISCOVERIES.md](DISCOVERIES.md).
- **`WatchMediaListenerService` (`NotificationListenerService` + `MediaSessionManager`)**:
  - Complementa a captura lendo sessões de mídia ativas (`MediaController` / `MediaMetadata` / `PlaybackState`) — útil especialmente para o **Crunchyroll**.
- **`ScrobbleReporter`**:
  - Normaliza o estado atual (`app`, `title`, `season`, `episode`, `episodeTitle`, `positionSec`, `durationSec`) e envia `POST` JSON para o endpoint configurado via `OkHttp` / `HttpURLConnection`.

## Conexão ADB com a TV (Desenvolvimento)

- **IP da TV:** `192.168.3.9:5555`
- **Modelo:** `SmartTV 4K FFM` (`lushan`), Android 12 (API 31)
- Comandos úteis:
  ```bash
  adb connect 192.168.3.9:5555
  adb -s 192.168.3.9:5555 install -r app-debug.apk

  # Habilitar AccessibilityService e NotificationListener direto via ADB (sem precisar achar menu escondido na TV)
  adb -s 192.168.3.9:5555 shell settings put secure enabled_accessibility_services <SEU_PACOTE>/<SEU_PACOTE>.WatchAccessibilityService
  adb -s 192.168.3.9:5555 shell cmd notification allow_listener <SEU_PACOTE>/<SEU_PACOTE>.WatchMediaListenerService
  ```

Veja todos os detalhes técnicos coletados ao vivo na TV em [DISCOVERIES.md](DISCOVERIES.md).
