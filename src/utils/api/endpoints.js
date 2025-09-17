const EndPoints = {
    // Auth Flow
    login: 'login',
    register: 'signup',
    verifyOtp: 'verify-otp',
    setscheduleTimerData: 'scheduleTimerData',
    getScheduleTimerData: 'get-scheduleTimerData',
    postTimerSchedule: 'post-timerSchedule',
    scheduleTimerCalendarEventData: 'scheduleTimerCalendarEventData',
    forgotPassword: 'forgot-password',
    resetPassword: 'reset-password',
    resetNewPassword: 'create-new-password',
    resendOtp: 'resend-otp',
    scheduleTimerDataDelete: 'scheduleTimerData/{schedule_id}',
    logOut: '/logout',
};

export default EndPoints;
