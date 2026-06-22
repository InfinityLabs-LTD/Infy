// Корневой Gradle-проект Android-клиента Infy.
//
// Позволяет открывать и собирать мобильное приложение в Android Studio прямо
// из корня репозитория. Сам код приложения физически остаётся в
// mobile/android/app — сюда вынесены только Gradle-файлы проекта, а модуль
// :app перенаправлен на свою настоящую папку (см. project(":app").projectDir).
//
// Каталог версий (libs.*) переиспользуется из mobile/android, чтобы не
// дублировать зависимости.

pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
    versionCatalogs {
        create("libs") {
            from(files("mobile/android/gradle/libs.versions.toml"))
        }
    }
}

rootProject.name = "Infy"

include(":app")
project(":app").projectDir = file("mobile/android/app")
