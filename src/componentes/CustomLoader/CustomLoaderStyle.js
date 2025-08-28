import { StyleSheet } from "react-native";
import { Colors } from "../../utils/theme";
import { width } from "../../function/commonFunctions";

export const styles = StyleSheet.create({
    customLoaderMainView: {
        position: 'absolute',
        right: 0,
        left: 0,
        top: 0,
        bottom: 0,
        backgroundColor: Colors.loaderBackground,
    },
    customLoaderView: {
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
    },
    leaderView: {
        justifyContent: 'center',
        alignItems: 'center',
        width: width(100),
        height: width(100),
        backgroundColor: Colors.themeColor,
        borderRadius: width(12),
    },
});