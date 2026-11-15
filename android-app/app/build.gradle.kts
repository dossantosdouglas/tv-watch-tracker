plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.fox.tvwatchtracker"
    compileSdk = 31

    defaultConfig {
        applicationId = "com.fox.tvwatchtracker"
        minSdk = 26
        targetSdk = 31
        versionCode = 1
        versionName = "1.0.0"

        buildConfigField(
            "String",
            "DEFAULT_ENDPOINT_URL",
            "\"http://127.0.0.1:3000/api/scrobble\""
        )
        buildConfigField(
            "String",
            "DEFAULT_API_KEY",
            "\"fox-tv-tracker-2026\""
        )
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.8.0")
    implementation("androidx.appcompat:appcompat:1.4.2")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.7.3")
    testImplementation("junit:junit:4.13.2")
}
