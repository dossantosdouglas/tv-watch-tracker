package com.fox.tvwatchtracker

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var tvAccessibilityStatus: TextView
    private lateinit var tvMediaListenerStatus: TextView
    private lateinit var etEndpointUrl: EditText
    private lateinit var etApiKey: EditText
    private lateinit var tvLastScrobbleItem: TextView
    private lateinit var tvLastHttpStatus: TextView
    private lateinit var btnTestScrobble: Button
    private lateinit var btnOpenAccessibility: Button
    private lateinit var btnSaveConfig: Button
    private lateinit var btnOpenNotifications: Button

    private val uiHandler = Handler(Looper.getMainLooper())
    private val refreshRunnable = object : Runnable {
        override fun run() {
            refreshStatusViews()
            uiHandler.postDelayed(this, 2000L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        tvAccessibilityStatus = findViewById(R.id.tvAccessibilityStatus)
        tvMediaListenerStatus = findViewById(R.id.tvMediaListenerStatus)
        etEndpointUrl = findViewById(R.id.etEndpointUrl)
        etApiKey = findViewById(R.id.etApiKey)
        tvLastScrobbleItem = findViewById(R.id.tvLastScrobbleItem)
        tvLastHttpStatus = findViewById(R.id.tvLastHttpStatus)
        btnTestScrobble = findViewById(R.id.btnTestScrobble)
        btnOpenAccessibility = findViewById(R.id.btnOpenAccessibility)
        btnSaveConfig = findViewById(R.id.btnSaveConfig)
        btnOpenNotifications = findViewById(R.id.btnOpenNotifications)

        etEndpointUrl.setText(ConfigStore.getEndpointUrl(this))
        etApiKey.setText(ConfigStore.getApiKey(this))

        btnTestScrobble.setOnClickListener {
            btnTestScrobble.isEnabled = false
            tvLastHttpStatus.text = "Status HTTP: Enviando teste..."
            ScrobbleReporter.sendTestScrobble(this) { ok, statusLine ->
                runOnUiThread {
                    btnTestScrobble.isEnabled = true
                    refreshStatusViews()
                    val msg = if (ok) "Scrobble enviado: $statusLine" else "Falha no scrobble: $statusLine"
                    Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
                }
            }
        }

        btnOpenAccessibility.setOnClickListener {
            openSettingsSafely(Settings.ACTION_ACCESSIBILITY_SETTINGS)
        }

        btnOpenNotifications.setOnClickListener {
            openSettingsSafely(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        }

        btnSaveConfig.setOnClickListener {
            val url = etEndpointUrl.text.toString().trim()
            val key = etApiKey.text.toString().trim()
            ConfigStore.updateConfig(this, url, key)
            refreshStatusViews()
            Toast.makeText(this, "Configuração salva!", Toast.LENGTH_SHORT).show()
        }

        btnTestScrobble.requestFocus()
    }

    override fun onResume() {
        super.onResume()
        ScrobbleReporter.onStatusUpdated = {
            runOnUiThread {
                etEndpointUrl.setText(ConfigStore.getEndpointUrl(this))
                etApiKey.setText(ConfigStore.getApiKey(this))
                refreshStatusViews()
            }
        }
        refreshStatusViews()
        uiHandler.postDelayed(refreshRunnable, 2000L)
    }

    override fun onPause() {
        uiHandler.removeCallbacks(refreshRunnable)
        ScrobbleReporter.onStatusUpdated = null
        super.onPause()
    }

    private fun refreshStatusViews() {
        val a11yEnabled = ConfigStore.isAccessibilityServiceEnabled(this)
        val a11yConnected = WatchAccessibilityService.isConnected
        if (a11yEnabled || a11yConnected) {
            tvAccessibilityStatus.text = if (a11yConnected) "Ativo (Conectado)" else "Ativo"
            tvAccessibilityStatus.setTextColor(ContextCompat.getColor(this, R.color.status_ok))
        } else {
            tvAccessibilityStatus.text = "Inativo"
            tvAccessibilityStatus.setTextColor(ContextCompat.getColor(this, R.color.status_error))
        }

        val notifEnabled = ConfigStore.isNotificationListenerEnabled(this)
        val notifConnected = WatchMediaListenerService.isConnected
        if (notifEnabled || notifConnected) {
            tvMediaListenerStatus.text = if (notifConnected) "Ativo (Conectado)" else "Ativo"
            tvMediaListenerStatus.setTextColor(ContextCompat.getColor(this, R.color.status_ok))
        } else {
            tvMediaListenerStatus.text = "Inativo"
            tvMediaListenerStatus.setTextColor(ContextCompat.getColor(this, R.color.status_error))
        }

        tvLastScrobbleItem.text = ConfigStore.getLastScrobbleSummary(this)
        val httpStatus = ConfigStore.getLastScrobbleStatus(this)
        val time = ConfigStore.getLastScrobbleTime(this)
        tvLastHttpStatus.text = if (time.isNotEmpty()) {
            "Status HTTP: $httpStatus ($time)"
        } else {
            "Status HTTP: $httpStatus"
        }
        val statusColor = when {
            httpStatus.startsWith("2") -> R.color.status_ok
            httpStatus == "—" -> R.color.text_secondary
            else -> R.color.status_error
        }
        tvLastHttpStatus.setTextColor(ContextCompat.getColor(this, statusColor))
    }

    private fun openSettingsSafely(action: String) {
        try {
            startActivity(Intent(action))
        } catch (e: Exception) {
            Toast.makeText(this, "Não foi possível abrir configurações: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }
}
