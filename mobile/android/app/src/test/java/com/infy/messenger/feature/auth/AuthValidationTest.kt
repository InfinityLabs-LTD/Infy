package com.infy.messenger.feature.auth

import com.infy.messenger.feature.auth.ui.AuthValidation
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

/** Проверяем, что клиентская валидация зеркалит правила бэкенда (auth.schema.ts). */
class AuthValidationTest {

    @Test
    fun `username accepts lowercase alnum and underscore within 3 to 32`() {
        assertNull(AuthValidation.username("abc"))
        assertNull(AuthValidation.username("user_123"))
        assertNull(AuthValidation.username("a".repeat(32)))
    }

    @Test
    fun `username rejects too short, too long, uppercase and special chars`() {
        assertNotNull(AuthValidation.username("ab"))
        assertNotNull(AuthValidation.username("a".repeat(33)))
        assertNotNull(AuthValidation.username("UserName"))
        assertNotNull(AuthValidation.username("user-name"))
        assertNotNull(AuthValidation.username("user name"))
    }

    @Test
    fun `password requires at least 8 chars`() {
        assertNotNull(AuthValidation.password("1234567"))
        assertNull(AuthValidation.password("12345678"))
    }

    @Test
    fun `nickname requires non-blank`() {
        assertNotNull(AuthValidation.nickname("   "))
        assertNull(AuthValidation.nickname("Дима"))
    }

    @Test
    fun `email validates format when required`() {
        assertNull(AuthValidation.email("user@example.com"))
        assertNotNull(AuthValidation.email("not-an-email"))
        assertNotNull(AuthValidation.email(""))
    }

    @Test
    fun `optional email passes when blank but validates when present`() {
        assertNull(AuthValidation.emailOptional(""))
        assertNull(AuthValidation.emailOptional("user@example.com"))
        assertNotNull(AuthValidation.emailOptional("bad"))
    }
}
