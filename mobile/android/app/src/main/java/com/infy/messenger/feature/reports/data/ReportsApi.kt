package com.infy.messenger.feature.reports.data

import com.infy.messenger.core.network.ApiEnvelope
import retrofit2.http.Body
import retrofit2.http.POST

interface ReportsApi {

    /** Создать жалобу на пользователя. Возвращает { data: Report } (201). */
    @POST("reports")
    suspend fun create(@Body input: ReportInput): ApiEnvelope<ReportDto>
}
