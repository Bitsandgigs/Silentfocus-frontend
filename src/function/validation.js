export const validateEmail = email => {
    const re =
        /^(([^<>()[\]\\.,;:\s@\\"]+(\.[^<>()[\]\\.,;:\s@\\"]+)*)|(\\".+\\"))@(([^<>()[\]\\.,;:\s@\\"]+\.)+[^<>()[\]\\.,;:\s@\\"]{2,})$/i;

    return re.test(email);
};

export const validatePassword = password => {
    const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d|[^a-zA-Z]).{8,}$/;
    return re.test(password);
};

export const validateName = name => {
    const re = /^([a-zA-Z ]{1,})$/;
    return re.test(name);
};