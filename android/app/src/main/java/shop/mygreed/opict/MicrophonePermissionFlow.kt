package shop.mygreed.opict

internal enum class MicrophonePermissionAction {
    REQUEST,
    NOTIFY_GRANTED,
    NOTIFY_DENIED,
    IGNORE,
}

internal class MicrophonePermissionFlow {
    private var awaitingResult = false

    fun begin(permissionGranted: Boolean): MicrophonePermissionAction {
        if (permissionGranted) return MicrophonePermissionAction.NOTIFY_GRANTED
        if (awaitingResult) return MicrophonePermissionAction.IGNORE
        awaitingResult = true
        return MicrophonePermissionAction.REQUEST
    }

    fun finish(permissionGranted: Boolean): MicrophonePermissionAction {
        if (!awaitingResult) return MicrophonePermissionAction.IGNORE
        awaitingResult = false
        return if (permissionGranted) {
            MicrophonePermissionAction.NOTIFY_GRANTED
        } else {
            MicrophonePermissionAction.NOTIFY_DENIED
        }
    }

    fun cancel() {
        awaitingResult = false
    }
}
