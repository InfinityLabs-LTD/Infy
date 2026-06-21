package com.infy.messenger.feature.call.domain

/** Тип звонка. */
enum class CallMedia { AUDIO, VIDEO }

/** Фаза звонка с точки зрения UI. */
enum class CallPhase {
    /** Исходящий: набираем, ждём ответа. */
    OUTGOING,
    /** Входящий: звонят нам, ждём принятия/отклонения. */
    INCOMING,
    /** Соединение устанавливается (после accept, идёт ICE). */
    CONNECTING,
    /** Активный разговор. */
    ACTIVE,
    /** Звонок завершён. */
    ENDED,
}

/** Информация о собеседнике в звонке. */
data class CallPeer(
    val id: String,
    val username: String,
    val nickname: String,
    val avatarUrl: String?,
)

/** Полное состояние текущего звонка. */
data class CallState(
    val callId: String,
    val chatId: String,
    val media: CallMedia,
    val phase: CallPhase,
    /** Мы инициатор (polite=false) или получатель (polite=true). */
    val isInitiator: Boolean,
    val peer: CallPeer?,
    val micOn: Boolean = true,
    val camOn: Boolean,
    val speakerOn: Boolean,
    /** Камера/микрофон собеседника (по call:media-state). */
    val peerMicOn: Boolean = true,
    val peerCamOn: Boolean = true,
    /** Длительность активного разговора в секундах. */
    val durationSec: Int = 0,
    /** Причина завершения (для финального экрана). */
    val endReason: String? = null,
)

/** Элемент истории звонков. */
data class CallHistoryItem(
    val id: String,
    val chatId: String,
    val media: CallMedia,
    val status: String,
    val durationSec: Int,
    val isOutgoing: Boolean,
    val createdAt: Long,
    val peer: CallPeer?,
)
