/**
 * 好男人陀螺實驗室 - Firebase 設定檔
 * 
 * 您的 Firebase 專案設定已成功寫入，專案連線已正式啟用！
 */

const firebaseConfig = {
    apiKey: "AIzaSyDWCDyjs-TxnhD-vqJhTyeHWS2xH9ea0K8",
    authDomain: "beybladex-c6fac.firebaseapp.com",
    databaseURL: "https://beybladex-c6fac-default-rtdb.firebaseio.com",
    projectId: "beybladex-c6fac",
    storageBucket: "beybladex-c6fac.firebasestorage.app",
    messagingSenderId: "926056674456",
    appId: "1:926056674456:web:1c86bad2c236f09cdbcced",
    measurementId: "G-9056LX67XX"
};

// 初始化 Firebase
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase initialized successfully.");
} else {
    console.error("Firebase SDK not loaded yet. Please include Firebase scripts in your HTML first.");
}
