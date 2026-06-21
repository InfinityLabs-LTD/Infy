# kotlinx.serialization: сохраняем сериализаторы для @Serializable-классов.
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.**

-keepclassmembers class **$$serializer { *; }
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.infy.messenger.**$$serializer { *; }
-keepclassmembers class com.infy.messenger.** {
    *** Companion;
}
-keepclasseswithmembers class com.infy.messenger.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# Retrofit
-keepattributes Signature, Exceptions
-keep,allowobfuscation interface * { @retrofit2.http.* <methods>; }
-keep class kotlin.coroutines.Continuation
