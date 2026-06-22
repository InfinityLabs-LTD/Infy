// Корневой build-скрипт: только объявляем плагины, версии берём из version catalog.
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.hilt) apply false
    alias(libs.plugins.ksp) apply false
    // Плагин google-services объявляем здесь (apply false) только чтобы положить
    // его на classpath сборки. В :app он применяется УСЛОВНО — лишь при наличии
    // google-services.json, иначе сборка падала бы без файла. См. app/build.gradle.kts.
    alias(libs.plugins.google.services) apply false
}
