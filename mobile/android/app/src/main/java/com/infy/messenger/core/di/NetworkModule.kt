package com.infy.messenger.core.di

import com.infy.messenger.BuildConfig
import com.infy.messenger.core.network.AuthInterceptor
import com.infy.messenger.core.network.TokenAuthenticator
import com.infy.messenger.core.network.TokenRefreshApi
import com.infy.messenger.feature.auth.data.AuthApi
import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.Dns
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import java.net.InetAddress
import java.util.concurrent.TimeUnit
import javax.inject.Qualifier
import javax.inject.Singleton

/** Квалификатор «голого» клиента/Retrofit для refresh — без auth-перехватчиков. */
@Qualifier
@Retention(AnnotationRetention.BINARY)
annotation class RefreshClient

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideDns(): Dns = object : Dns {
        override fun lookup(hostname: String): List<InetAddress> {
            return if (hostname == "infyme.ru") {
                // Прямой маппинг домена на IP, если системный DNS эмулятора тупит.
                listOf(InetAddress.getByName("144.31.101.68"))
            } else {
                Dns.SYSTEM.lookup(hostname)
            }
        }
    }

    @Provides
    @Singleton
    fun provideJson(): Json = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
        coerceInputValues = true
    }

    @Provides
    @Singleton
    fun provideLoggingInterceptor(): HttpLoggingInterceptor =
        HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }

    /** Основной клиент: добавляет Bearer и рефрешит токены при 401. */
    @Provides
    @Singleton
    fun provideOkHttpClient(
        authInterceptor: AuthInterceptor,
        authenticator: TokenAuthenticator,
        logging: HttpLoggingInterceptor,
        dns: Dns,
    ): OkHttpClient = OkHttpClient.Builder()
        .dns(dns)
        .addInterceptor(authInterceptor)
        .authenticator(authenticator)
        .addInterceptor(logging)
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        // Загрузка медиа может быть долгой — даём запас на запись тела.
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()

    /** Голый клиент для /auth/refresh: без Authenticator, чтобы не зациклиться. */
    @Provides
    @Singleton
    @RefreshClient
    fun provideRefreshOkHttpClient(
        logging: HttpLoggingInterceptor,
        dns: Dns,
    ): OkHttpClient = OkHttpClient.Builder()
        .dns(dns)
        .addInterceptor(logging)
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    @Provides
    @Singleton
    fun provideRetrofit(client: OkHttpClient, json: Json): Retrofit {
        val contentType = "application/json".toMediaType()
        return Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(json.asConverterFactory(contentType))
            .build()
    }

    @Provides
    @Singleton
    @RefreshClient
    fun provideRefreshRetrofit(
        @RefreshClient client: OkHttpClient,
        json: Json,
    ): Retrofit {
        val contentType = "application/json".toMediaType()
        return Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(json.asConverterFactory(contentType))
            .build()
    }

    @Provides
    @Singleton
    fun provideAuthApi(retrofit: Retrofit): AuthApi = retrofit.create(AuthApi::class.java)

    @Provides
    @Singleton
    fun provideChatApi(retrofit: Retrofit): com.infy.messenger.feature.chat.data.remote.ChatApi =
        retrofit.create(com.infy.messenger.feature.chat.data.remote.ChatApi::class.java)

    @Provides
    @Singleton
    fun provideMediaApi(retrofit: Retrofit): com.infy.messenger.feature.media.data.MediaApi =
        retrofit.create(com.infy.messenger.feature.media.data.MediaApi::class.java)

    @Provides
    @Singleton
    fun provideCallApi(retrofit: Retrofit): com.infy.messenger.feature.call.data.CallApi =
        retrofit.create(com.infy.messenger.feature.call.data.CallApi::class.java)

    @Provides
    @Singleton
    fun provideProfileApi(retrofit: Retrofit): com.infy.messenger.feature.profile.data.ProfileApi =
        retrofit.create(com.infy.messenger.feature.profile.data.ProfileApi::class.java)

    @Provides
    @Singleton
    fun provideSessionsApi(retrofit: Retrofit): com.infy.messenger.feature.profile.data.SessionsApi =
        retrofit.create(com.infy.messenger.feature.profile.data.SessionsApi::class.java)

    @Provides
    @Singleton
    fun provideTokenRefreshApi(@RefreshClient retrofit: Retrofit): TokenRefreshApi =
        retrofit.create(TokenRefreshApi::class.java)
}
