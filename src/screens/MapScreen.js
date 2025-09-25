import React, {useState, useEffect} from 'react';
import {
    View,
    StyleSheet,
    Platform,
    PermissionsAndroid,
    useColorScheme,
    TouchableOpacity,
    FlatList,
    ScrollView,
    Text,
    Alert,
} from 'react-native';
import MapView, {Marker} from 'react-native-maps';
import Geolocation from 'react-native-geolocation-service';
import {GooglePlacesAutocomplete} from 'react-native-google-places-autocomplete';
import SafeAreaContainerView from '../componentes/SafeAreaContainerView/SafeAreaContainerView';
import ContainerView from '../componentes/ContainerView/ContainerView';
// Lib
import {
    widthPercentageToDP as wp,
    heightPercentageToDP as hp,
} from 'react-native-responsive-screen';

import {Colors} from '../utils/theme';
import {useNavigation} from '@react-navigation/native';
import BackIcon from '../assets/svgs/Back';

const initialLocations = [
    {
        id: 1,
        name: 'Central Park',
        street: 'Chandigarh, 160047',
        latitude: 40.785091,
        longitude: -73.968285,
    },
    {
        id: 2,
        name: 'Times Square',
        street: 'Chandigarh, 160047',
        latitude: 40.758896,
        longitude: -73.98513,
    },
    {
        id: 3,
        name: 'Statue of Liberty',
        street: 'Chandigarh, 160047',
        latitude: 40.689247,
        longitude: -74.044502,
    },
    // {
    //     id: 4,
    //     name: 'Empire State Building',
    //     latitude: 40.748817,
    //     longitude: -73.985428,
    // },
    // {
    //     id: 5,
    //     name: 'Brooklyn Bridge',
    //     latitude: 40.706086,
    //     longitude: -73.996864,
    // },
];

const MapScreen = () => {
    const navigation = useNavigation();
    const [region, setRegion] = useState(null);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [locationList, setLocationList] = useState(initialLocations);
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    useEffect(() => {
        requestLocationPermission();
    }, []);

    const requestLocationPermission = async () => {
        if (Platform.OS === 'android') {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            );
            if (granted === PermissionsAndroid.RESULTS.GRANTED) {
                getCurrentLocation();
            }
        } else {
            getCurrentLocation();
        }
    };

    const getCurrentLocation = () => {
        Geolocation.getCurrentPosition(
            position => {
                const {latitude, longitude} = position.coords;
                setRegion({
                    latitude,
                    longitude,
                    latitudeDelta: 0.01,
                    longitudeDelta: 0.01,
                });
            },
            error => console.log(error),
            {enableHighAccuracy: true, timeout: 15000, maximumAge: 10000},
        );
    };

    const handlePlaceSelect = (data, details) => {
        if (!details?.geometry?.location) {
            Alert.alert('Error', 'Location details not found!');
            return;
        }

        const lat = details.geometry.location.lat;
        const lng = details.geometry.location.lng;

        setSelectedLocation({latitude: lat, longitude: lng});
        setRegion({
            latitude: lat,
            longitude: lng,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
        });
    };

    const saveLocation = () => {
        if (selectedLocation) {
            console.log('Saved location:', selectedLocation);
            alert('Location saved successfully!');
        } else {
            alert('Please select a location first.');
        }
    };

    const onPressDelete = id => {
        Alert.alert(
            'Delete Location',
            'Are you sure you want to delete this place?',
            [
                {
                    text: 'Cancel',
                    style: 'cancel',
                },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => {
                        // ✅ Remove the item by filtering it out
                        const updatedList = locationList.filter(
                            item => item.id !== id,
                        );
                        setLocationList(updatedList);
                    },
                },
            ],
        );
    };

    const onPressGoBack = () => {
        navigation.goBack();
    };

    return (
        <ContainerView>
            <SafeAreaContainerView
                style={{
                    flex: 1,
                    backgroundColor: isDark ? '#111111' : '#ffffff',
                }}>
                <View
                    style={[
                        styles.container,
                        {backgroundColor: isDark ? '#111111' : '#fff'},
                    ]}>
                    <ScrollView
                        contentContainerStyle={[
                            styles.scrollContent,
                            {backgroundColor: isDark ? '#111111' : '#fff'},
                        ]}
                        showsVerticalScrollIndicator={false}>
                        <View style={styles.container}>
                            <View
                                style={{
                                    flexDirection: 'row',
                                }}>
                                <TouchableOpacity
                                    onPress={onPressGoBack}
                                    style={{
                                        height: 42,
                                        width: 40,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}>
                                    <BackIcon
                                        width={26}
                                        height={26}
                                        color={Colors.black}
                                    />
                                </TouchableOpacity>

                                <GooglePlacesAutocomplete
                                    placeholder="Search Places"
                                    fetchDetails={true}
                                    onPress={(data, details = null) =>
                                        handlePlaceSelect(data, details)
                                    }
                                    query={{
                                        key: 'AIzaSyDCLTglwawax2XO4iC9tj90QmMlAR6Lxc4',
                                        language: 'en',
                                    }}
                                    predefinedPlaces={[]}
                                    textInputProps={{}}
                                    styles={{
                                        container: {
                                            width: '90%',
                                            marginBottom: 16,
                                            flex: 0,
                                            // backgroundColor: 'green',
                                        },
                                        textInputContainer: {
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                        },
                                        textInput: {
                                            borderRadius: 10,
                                            padding: 16,
                                            backgroundColor: Colors.textInputBg,
                                            fontSize: 16,
                                        },
                                        listView: {
                                            position: 'absolute',
                                            top: 50,
                                            zIndex: 9999,
                                        },
                                    }}
                                    listViewDisplayed="auto"
                                />
                            </View>

                            {region && (
                                <MapView
                                    style={styles.map}
                                    region={region}
                                    onPress={e =>
                                        setSelectedLocation(
                                            e.nativeEvent.coordinate,
                                        )
                                    }>
                                    {selectedLocation && (
                                        <Marker
                                            coordinate={selectedLocation}
                                            title="Selected Location"
                                        />
                                    )}
                                </MapView>
                            )}

                            <FlatList
                                key={'locationData'}
                                data={locationList}
                                keyExtractor={item => item.id.toString()}
                                keyboardShouldPersistTaps="handled"
                                scrollEnabled={false}
                                ListHeaderComponent={
                                    <Text style={styles.addedPlacesTitle}>
                                        Added Places
                                    </Text>
                                }
                                renderItem={({item}) => (
                                    <View
                                        style={[
                                            styles.locationCard,
                                            {
                                                backgroundColor: isDark
                                                    ? '#1C1C1C'
                                                    : '#5555551F',
                                            },
                                        ]}>
                                        <View style={{flex: 1}}>
                                            <Text
                                                style={[
                                                    styles.locationName,
                                                    {
                                                        color: isDark
                                                            ? 'white'
                                                            : '#1C1C1C',
                                                    },
                                                ]}>
                                                {item.name}
                                            </Text>
                                            <Text
                                                style={[
                                                    styles.locationAddress,
                                                    {
                                                        color: isDark
                                                            ? 'white'
                                                            : '#1C1C1C',
                                                    },
                                                ]}>
                                                {item.street}
                                            </Text>
                                            <View style={styles.tagContainer}>
                                                <Text style={styles.tagText}>
                                                    Office
                                                </Text>
                                            </View>
                                        </View>
                                        <TouchableOpacity
                                            style={styles.removeButton}
                                            onPress={() =>
                                                onPressDelete(item.id)
                                            }>
                                            <Text
                                                style={styles.removeButtonText}>
                                                ×
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            />
                        </View>
                    </ScrollView>
                </View>
            </SafeAreaContainerView>
        </ContainerView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingTop: hp('1%'),
        paddingHorizontal: wp('2%'),
    },
    footer: {
        width: '100%',
        height: '40%',
    },
    searchContainer: {
        width: '100%',
        marginBottom: 16,
    },
    searchInput: {
        borderRadius: 10,
        padding: 10,
        backgroundColor: 'red',
    },
    map: {
        height: 300,
        width: '100%',
        borderRadius: 10,
        marginBottom: 16,
    },
    saveButton: {
        backgroundColor: '#ff6600',
        padding: 15,
        borderRadius: 10,
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 16,
        textAlign: 'center',
        fontWeight: 'bold',
    },

    addedPlacesTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: Colors.black,
        marginBottom: 10,
    },

    locationCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
        borderRadius: 12,
        marginBottom: 18,
        shadowColor: '#000',
        shadowOffset: {width: 0, height: 2},
        shadowOpacity: 0.2,
        shadowRadius: 4,
        elevation: 3,
    },
    locationName: {
        fontSize: 16,
        color: '#D6721E',
        fontWeight: '500',
    },
    locationAddress: {
        fontSize: 14,
        color: '#D6721E',
        marginVertical: 4,
    },
    tagContainer: {
        alignSelf: 'flex-start',
        backgroundColor: '#d46c0d',
        paddingVertical: 4,
        paddingHorizontal: 12,
        borderRadius: 20,
        marginTop: 6,
    },
    tagText: {
        fontSize: 12,
        color: '#fff',
        fontWeight: '600',
    },
    removeButton: {
        position: 'absolute',
        top: -12,
        right: 5,
        backgroundColor: '#333',
        borderRadius: 15,
        width: 25,
        height: 25,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    removeButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default MapScreen;
