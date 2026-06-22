// Корневой build-скрипт Android-проекта: только объявляем плагины,
// версии берём из version catalog (mobile/android/gradle/libs.versions.toml).
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.hilt) apply false
    alias(libs.plugins.ksp) apply false
    // Плагин google-services кладём на classpath (apply false). В :app он
    // применяется условно — только при наличии google-services.json.
    alias(libs.plugins.google.services) apply false
}
