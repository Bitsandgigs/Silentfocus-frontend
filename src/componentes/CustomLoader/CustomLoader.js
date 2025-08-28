import { ActivityIndicator, View } from "react-native";
import { styles } from "./CustomLoaderStyle";
import { Colors } from "../../utils/theme";
import { useEffect, useState } from "react";


export default function CustomLoader(props) {
    // Props
    const { isLoading } = props;

    // useState
    const [loader, setLoader] = useState(false);

    // useEffect
    useEffect(() => {
        if (isLoading !== undefined) {
            setLoader(isLoading);
        }
    }, [isLoading]);

    // Render Component
    return (
        <>
            {loader && (
                <View style={styles.customLoaderMainView}>
                    <View style={styles.customLoaderView}>
                        <View style={styles.leaderView}>
                            <ActivityIndicator size={'large'} color={Colors.white} />
                        </View>
                    </View>
                </View>
            )}
        </>
    ); s
}