# Descobertas Técnicas na TV (15/11/2026)

Dados coletados ao vivo via ADB na TV do Fox.

## Dispositivo Alvo

- **Modelo:** `SmartTV 4K FFM` (`product: lushan`)
- **Android:** `12` (SDK `31`)
- **IP / ADB:** `192.168.3.9:5555` (autorização "Sempre permitir" já concedida para este PC)

---

## 1. Crunchyroll (`com.crunchyroll.crunchyroid`)

- **Activity do Player:** `com.crunchyroll.crunchyroid/.player.ui.PlayerActivity`
- **MediaSession:**
  - Publica sessão ativa (`androidx.media3.session.id.*`).
  - `PlaybackState`: `state=3` (Playing), `position` em ms.
  - `MediaMetadata`: `description` contém o título do episódio (ex.: `"O Deus da Destruição e Son Goku"`).
- **Árvore de Acessibilidade (`uiautomator` / `AccessibilityNodeInfo`):**
  - `content-desc` completo:
    `"Você está assistindo Dragon Ball Super: Beerus. \nTemporada 1Episódio 5. O Deus da Destruição e Son Goku"`
  - `com.crunchyroll.crunchyroid:id/detailsTitle` -> `"Dragon Ball Super: Beerus"`
  - `com.crunchyroll.crunchyroid:id/detailsEpisodeTitle` -> `"E5 - O Deus da Destruição e Son Goku"`
  - `com.crunchyroll.crunchyroid:id/txtCurrentTime` -> `"08:17"`
  - `com.crunchyroll.crunchyroid:id/txtRemainingTime` -> `"23:17"`

**Conclusão Crunchyroll:** 100% capturável tanto via `MediaSession` quanto via `AccessibilityService`.

---

## 2. YouCine (`com.world.youcinetv`)

- **Activity Principal de Reprodução/Detalhes:** `com.world.youcinetv/com.vod.ui.activity.VodDetailsActivity`
- **MediaSession:**
  - **Não publica** `MediaSession` no sistema.
  - Aparece apenas no `AudioPlaybackConfiguration` (`uid=10106`, `packages=com.world.youcinetv`).
- **Hierarquia de Views (`dumpsys activity top`):**
  - Usa Views nativas Android (`MarqueTextView`, `androidx.appcompat.widget.AppCompatTextView`), mesmo quando o `uiautomator dump` em tela cheia retorna apenas o container `cb.c` por conta do overlay oculto.
  - **Resource IDs relevantes:**
    - `com.world.youcinetv:id/mTextTitle` (`MarqueTextView`) — título na tela de detalhes
    - `com.world.youcinetv:id/mTvName` (`AppCompatTextView`) — nome do vídeo/episódio dentro de `mPlayerWindow`
    - `com.world.youcinetv:id/mTvCurrentTime` — tempo atual
    - `com.world.youcinetv:id/mTvMaxTime` — duração total
    - `com.world.youcinetv:id/mPlayerWindow` (`com.vod.view.VodPlayerWindow`)
    - `com.world.youcinetv:id/mInfoBar`

**Conclusão YouCine:** Como não há `MediaSession`, o `AccessibilityService` deve usar `flagIncludeNotImportantViews` / `flagReportViewIds` e capturar os textos assim que `VodDetailsActivity` abre (`mTextTitle`) e sempre que `mInfoBar` / `mTvName` aparecer ou mudar de conteúdo.
