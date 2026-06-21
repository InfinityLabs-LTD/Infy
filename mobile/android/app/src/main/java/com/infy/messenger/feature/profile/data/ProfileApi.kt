package com.infy.messenger.feature.profile.data

import com.infy.messenger.core.network.ApiEnvelope
import okhttp3.MultipartBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path

interface ProfileApi {

    @GET("profile/me")
    suspend fun getMe(): ApiEnvelope<ProfileDto>

    @GET("profile/me/stats")
    suspend fun getStats(): ApiEnvelope<ProfileStatsDto>

    @PATCH("profile/me")
    suspend fun updateProfile(@Body body: UpdateProfileRequest): ApiEnvelope<ProfileDto>

    @Multipart
    @POST("profile/me/avatar")
    suspend fun uploadAvatar(@Part file: MultipartBody.Part): ApiEnvelope<AvatarResponse>

    @Multipart
    @POST("profile/me/cover")
    suspend fun uploadCover(@Part file: MultipartBody.Part): ApiEnvelope<CoverResponse>
}

interface SessionsApi {

    @GET("sessions")
    suspend fun listSessions(): ApiEnvelope<List<DeviceSessionDto>>

    @DELETE("sessions/{id}")
    suspend fun revokeSession(@Path("id") id: String): Response<Unit>

    @POST("sessions/logout-all")
    suspend fun logoutAll(@Body body: LogoutAllRequest): ApiEnvelope<LogoutAllResponse>
}
