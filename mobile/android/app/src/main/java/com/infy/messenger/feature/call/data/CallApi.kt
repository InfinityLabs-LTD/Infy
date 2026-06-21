package com.infy.messenger.feature.call.data

import com.infy.messenger.core.network.ApiEnvelope
import retrofit2.http.GET
import retrofit2.http.Query

interface CallApi {

    /** ICE-серверы (STUN + time-limited TURN). Запрашивать перед каждым звонком. */
    @GET("calls/ice")
    suspend fun getIceServers(): ApiEnvelope<IceServersDto>

    @GET("calls/history")
    suspend fun getHistory(
        @Query("cursor") cursor: String?,
        @Query("limit") limit: Int,
    ): ApiEnvelope<CallHistoryPageDto>
}
