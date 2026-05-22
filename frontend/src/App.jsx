import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, 
  ShieldAlert, 
  ShieldCheck, 
  Lock, 
  Unlock, 
  BellRing, 
  BellOff,
  Wifi,
  WifiOff,
  Activity,
  Volume2,
  IdCard,
  Cpu,
  UserCheck,
  LayoutDashboard,
  Users,
  Trash2,
  Loader2,
  XCircle,
  Phone,
  Save
} from 'lucide-react';

const DATABASE_URL = "https://anti-theft-system-50561-default-rtdb.asia-southeast1.firebasedatabase.app";
const SECRET = "WqaYphYJ2GmcBetMgCUp1DrU2KzGZ7toeSYD3ABt";
const PATH = `/artifacts/anti-theft-app/public/data/vehicle/status.json?auth=${SECRET}`;
const PYTHON_SERVER_URL = "http://SWIRIK-LAB:5000";

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isConnected, setIsConnected] = useState(false);
  const [movementDetected, setMovementDetected] = useState(false);
  const [isLocked, setIsLocked] = useState(true);
  const [alarmActive, setAlarmActive] = useState(false);
  const [rfidStatus, setRfidStatus] = useState('idle'); 
  const [lastVerifiedFace, setLastVerifiedFace] = useState(null);
  const [location, setLocation] = useState({ lat: 6.9214, lon: 122.0790 });
  const [lastUpdate, setLastUpdate] = useState(new Date().toLocaleTimeString());
  const [clickCount, setClickCount] = useState(0);
  const [showSecretModal, setShowSecretModal] = useState(false);
  const [syncStatus, setSyncStatus] = useState("Sync Device Location");
  
  const [profiles, setProfiles] = useState([]);
  const [isRegistering, setIsRegistering] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  
  const [ownerPhoneNumber, setOwnerPhoneNumber] = useState('');
  const [inputPhoneNumber, setInputPhoneNumber] = useState('');

  const isUpdating = useRef(false);
  const prevIsRegistering = useRef(false);

  const showNotification = (message, type) => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: '' }), 4000);
  };

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    html.style.overflowX = 'hidden';
    html.style.width = '100%';
    html.style.minHeight = '100%';
    body.style.overflowX = 'hidden';
    body.style.width = '100%';
    body.style.minHeight = '100%';
    body.style.margin = '0';
    if (root) {
      root.style.width = '100%';
      root.style.minHeight = '100%';
    }

    return () => {
      html.style.overflowX = '';
      html.style.width = '';
      html.style.minHeight = '';
      body.style.overflowX = '';
      body.style.width = '';
      body.style.minHeight = '';
      body.style.margin = '';
      if (root) {
        root.style.width = '';
        root.style.minHeight = '';
      }
    };
  }, []);

  const fetchProfiles = async () => {
    try {
      const res = await fetch(`${PYTHON_SERVER_URL}/api/profiles`);
      const data = await res.json();
      setProfiles(data.profiles || []);
    } catch (error) {}
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (isUpdating.current) return; 
      
      try {
        const response = await fetch(DATABASE_URL + PATH);
        if (!response.ok) throw new Error("Network error");
        
        const data = await response.json();
        if (data) {
          setMovementDetected(data.movementDetected ?? false);
          setIsLocked(data.isLocked ?? true);
          setAlarmActive(data.alarmActive ?? false);
          
          if (data.ownerPhoneNumber !== undefined && data.ownerPhoneNumber !== ownerPhoneNumber) {
            setOwnerPhoneNumber(data.ownerPhoneNumber);
            if (inputPhoneNumber === '') {
              setInputPhoneNumber(data.ownerPhoneNumber);
            }
          }
          
          if (data.lastVerifiedFace && data.lastVerifiedFace !== lastVerifiedFace) {
            setLastVerifiedFace(data.lastVerifiedFace);
            if (data.rfidStatus === 'idle') {
              showNotification("Registration Successful", "success");
              setIsRegistering(false);
              fetchProfiles();
            }
          }

          if (data.rfidStatus === 'authorized' && rfidStatus !== 'authorized') {
            showNotification("Authentication Successful", "success");
          } else if (data.rfidStatus === 'unauthorized' && rfidStatus !== 'unauthorized') {
            showNotification("Authentication Failed", "error");
          }

          setRfidStatus(data.rfidStatus ?? 'idle');
          if (data.location) setLocation(data.location);
          setLastUpdate(new Date().toLocaleTimeString());
          setIsConnected(true);
        }
      } catch (error) {
        setIsConnected(false);
      }
    };
    
    fetchData();
    const interval = setInterval(fetchData, 1000);
    return () => clearInterval(interval);
  }, [isRegistering, lastVerifiedFace, rfidStatus, ownerPhoneNumber, inputPhoneNumber]);

  useEffect(() => {
    if (prevIsRegistering.current && !isRegistering && !lastVerifiedFace) {
      showNotification("Registration Failed or Timed Out", "error");
    }
    prevIsRegistering.current = isRegistering;
  }, [isRegistering, lastVerifiedFace]);

  useEffect(() => {
    if (lastVerifiedFace) {
      const timer = setTimeout(async () => {
        setLastVerifiedFace(null);
        await updateVehicleStatus({ lastVerifiedFace: null, rfidStatus: 'idle' });
      }, 5000); 
      
      return () => clearTimeout(timer);
    }
  }, [lastVerifiedFace]);

  const updateVehicleStatus = async (updates) => {
    isUpdating.current = true;
    try {
      await fetch(DATABASE_URL + PATH, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });
    } catch (error) {
    } finally {
      setTimeout(() => {
        isUpdating.current = false;
      }, 2500);
    }
  };

  const handleToggleLock = () => {
    const nextLockState = !isLocked;
    setIsLocked(nextLockState);
    updateVehicleStatus({ 
      isLocked: nextLockState,
      movementDetected: nextLockState ? false : movementDetected,
      rfidStatus: nextLockState ? 'idle' : rfidStatus,
      lastVerifiedFace: nextLockState ? null : lastVerifiedFace
    });
  };

  const handleRegisterFace = () => {
    if (profiles.length >= 4) {
      alert("Maximum of 4 profiles reached. Please delete a profile first.");
      return;
    }
    setIsRegistering(true);
    updateVehicleStatus({ enrollRequested: true });
    
    setTimeout(() => {
      setIsRegistering(false);
    }, 15000);
  };

  const handleDeleteProfile = async (faceId) => {
    try {
      await fetch(`${PYTHON_SERVER_URL}/api/profiles/${faceId}`, {
        method: 'DELETE'
      });
      fetchProfiles();
    } catch (error) {}
  };

  const handleDisableAlarm = () => {
    setAlarmActive(false);
    setMovementDetected(false);
    setRfidStatus('idle');
    setLastVerifiedFace(null);
    updateVehicleStatus({
      alarmActive: false,
      movementDetected: false,
      rfidStatus: 'idle',
      lastVerifiedFace: null
    });
  };

  const handleFindVehicle = () => {
    setAlarmActive(true);
    updateVehicleStatus({ alarmActive: true });
    setTimeout(() => {
      setAlarmActive(false);
      updateVehicleStatus({ alarmActive: false });
    }, 3000);
  };

  const handleSavePhone = () => {
    updateVehicleStatus({ ownerPhoneNumber: inputPhoneNumber });
    setOwnerPhoneNumber(inputPhoneNumber);
    showNotification("Alert Number Updated", "success");
  };

  const handleLogoClick = () => {
    setClickCount(prev => {
      const newCount = prev + 1;
      if (newCount >= 5) {
        setShowSecretModal(true);
        return 0;
      }
      return newCount;
    });
    setTimeout(() => setClickCount(0), 2000);
  };

  const executeSecretSync = () => {
    setSyncStatus("Acquiring GPS Signal...");
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          setSyncStatus("Pushing to Satellite Cloud...");
          await updateVehicleStatus({
            location: {
              lat: position.coords.latitude,
              lon: position.coords.longitude
            }
          });
          setSyncStatus("Sync Complete!");
          setTimeout(() => {
            setShowSecretModal(false);
            setSyncStatus("Sync Device Location");
          }, 1000);
        }, 
        () => {
          setSyncStatus("GPS Permission Denied.");
          setTimeout(() => setSyncStatus("Sync Device Location"), 2000);
        },
        { enableHighAccuracy: true }
      );
    } else {
      setSyncStatus("GPS Not Supported.");
    }
  };

  const mapSrc = `https://www.openstreetmap.org/export/embed.html?bbox=${location.lon - 0.005},${location.lat - 0.005},${location.lon + 0.005},${location.lat + 0.005}&layer=mapnik&marker=${location.lat},${location.lon}`;

  return (
    <div className="min-h-screen w-screen overflow-hidden bg-slate-900 text-slate-100 font-sans relative" style={{ width: '100vw' }}>
      
      <div className="absolute top-0 w-full h-96 bg-gradient-to-b from-blue-900/20 to-transparent pointer-events-none"></div>

      <div className="max-w-6xl mx-auto space-y-6 p-4 md:p-8 relative z-10">
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center">
          <div 
            className="flex items-center space-x-3 mb-4 md:mb-0 cursor-default select-none"
            onClick={handleLogoClick}
          >
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20">
              <ShieldCheck size={32} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-widest text-white">OMNILOCK</h1>
              <p className="text-slate-400 text-xs uppercase tracking-widest font-semibold flex items-center mt-1">
                Security Systems <span className="mx-2">•</span> {lastUpdate}
              </p>
            </div>
          </div>
          
          <div className="flex gap-4">
            <div className="flex bg-slate-800/80 p-1 rounded-full border border-slate-700/50 backdrop-blur-md">
              <button 
                onClick={() => setActiveTab('dashboard')}
                className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <LayoutDashboard size={16} className="inline mr-2" />
                Dashboard
              </button>
              <button 
                onClick={() => setActiveTab('profiles')}
                className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${activeTab === 'profiles' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <Users size={16} className="inline mr-2" />
                Profiles ({profiles.length}/4)
              </button>
            </div>

            <div className={`flex items-center px-4 py-2 rounded-full font-medium text-sm transition-colors duration-500 ${isConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              {isConnected ? <Wifi size={16} className="mr-2" /> : <WifiOff size={16} className="mr-2" />}
              {isConnected ? 'ONLINE' : 'OFFLINE'}
            </div>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {(movementDetected || rfidStatus === 'unauthorized') && (
              <div className="bg-red-900/40 border border-red-500/50 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between shadow-[0_0_30px_rgba(239,68,68,0.2)] animate-pulse gap-4">
                <div className="flex items-center text-red-400">
                  <ShieldAlert size={28} className="mr-4 shrink-0" />
                  <div>
                    <span className="font-bold text-lg block text-white">SECURITY BREACH DETECTED</span>
                    <span className="text-sm">
                      {rfidStatus === 'unauthorized' 
                        ? 'Unauthorized Biometric / Face Scanned at Ignition.' 
                        : 'Unauthorized movement detected by MPU6050 Accelerometer.'}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={handleDisableAlarm}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-colors whitespace-nowrap shadow-lg shadow-red-900/50"
                >
                  DISARM ALARM
                </button>
              </div>
            )}

            {rfidStatus === 'authorized' && lastVerifiedFace && (
              <div className="bg-emerald-900/40 border border-emerald-500/50 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between shadow-[0_0_30px_rgba(16,185,129,0.2)] gap-4">
                <div className="flex items-center text-emerald-400">
                  <UserCheck size={28} className="mr-4 shrink-0" />
                  <div>
                    <span className="font-bold text-lg block text-white">BIOMETRIC AUTHENTICATED</span>
                    <span className="text-sm">Verified Profile ID: {lastVerifiedFace}</span>
                  </div>
                </div>
                <img 
                  src={`${PYTHON_SERVER_URL}/api/image/${lastVerifiedFace}`} 
                  alt="Profile" 
                  className="w-16 h-16 rounded-xl border-2 border-emerald-500 object-cover shadow-lg"
                  onError={(e) => {e.target.style.display = 'none'}}
                />
              </div>
            )}

            {rfidStatus === 'idle' && lastVerifiedFace && !movementDetected && (
              <div className="bg-purple-900/40 border border-purple-500/50 p-5 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between shadow-[0_0_30px_rgba(168,85,247,0.2)] gap-4">
                <div className="flex items-center text-purple-400">
                  <UserCheck size={28} className="mr-4 shrink-0" />
                  <div>
                    <span className="font-bold text-lg block text-white">NEW PROFILE REGISTERED</span>
                    <span className="text-sm">Assigned ID: {lastVerifiedFace}</span>
                  </div>
                </div>
                <img 
                  src={`${PYTHON_SERVER_URL}/api/image/${lastVerifiedFace}`} 
                  alt="Profile" 
                  className="w-16 h-16 rounded-xl border-2 border-purple-500 object-cover shadow-lg"
                  onError={(e) => {e.target.style.display = 'none'}}
                />
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              <div className="space-y-8 order-1 lg:order-last lg:col-span-1 min-w-0">
                
                <div className="bg-slate-800/50 backdrop-blur-xl p-8 rounded-3xl border border-slate-700 flex flex-col items-center justify-center relative overflow-hidden">
                  <div className={`w-32 h-32 rounded-full flex items-center justify-center mb-6 transition-all duration-700 shadow-2xl relative z-10 ${
                    isLocked ? 'bg-blue-500/10 shadow-blue-500/20' : 'bg-emerald-500/10 shadow-emerald-500/20'
                  } ${alarmActive ? 'bg-red-500/20 shadow-red-500/40 animate-pulse' : ''}`}>
                    {alarmActive ? (
                      <BellRing className="w-16 h-16 text-red-500" />
                    ) : isLocked ? (
                      <Lock className="w-16 h-16 text-blue-500" />
                    ) : (
                      <Unlock className="w-16 h-16 text-emerald-500" />
                    )}
                  </div>
                  <h2 className="text-3xl font-black tracking-wide mb-2">
                    {alarmActive ? 'ALARM TRIGGERED' : isLocked ? 'SECURED' : 'DISARMED'}
                  </h2>
                  <p className="text-slate-400 text-sm font-medium text-center">
                    {isLocked ? 'Ignition Cutoff Active. Locks Engaged.' : 'Systems Normal. Vehicle ready to start.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={handleToggleLock}
                    className={`col-span-2 flex items-center justify-center py-4 px-4 rounded-2xl font-bold transition-all duration-300 ${
                      isLocked 
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600' 
                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] border border-blue-500'
                    }`}
                  >
                    {isLocked ? <Unlock size={20} className="mr-3" /> : <Lock size={20} className="mr-3" />}
                    {isLocked ? 'DISENGAGE SECURITY' : 'ENGAGE SECURITY'}
                  </button>

                  <button 
                    onClick={handleFindVehicle}
                    className="flex flex-col items-center justify-center py-5 px-2 bg-slate-800 hover:bg-slate-700 rounded-2xl text-slate-200 transition-colors border border-slate-700"
                  >
                    <Volume2 size={26} className="mb-3 text-indigo-400" />
                    <span className="text-xs font-bold tracking-wider uppercase">Find Vehicle</span>
                  </button>

                  <button 
                    onClick={handleDisableAlarm}
                    disabled={!alarmActive && !movementDetected && rfidStatus !== 'unauthorized'}
                    className={`flex flex-col items-center justify-center py-5 px-2 rounded-2xl transition-all duration-300 ${
                      alarmActive || movementDetected || rfidStatus === 'unauthorized'
                        ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' 
                        : 'bg-slate-800/50 text-slate-600 cursor-not-allowed border border-slate-800'
                    }`}
                  >
                    <ShieldCheck size={26} className="mb-3" />
                    <span className="text-xs font-bold tracking-wider uppercase">Silence</span>
                  </button>
                </div>

                <div className="bg-slate-800/50 backdrop-blur-xl p-6 rounded-3xl border border-slate-700 space-y-4">
                  <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-700/50 pb-3">Hardware Diagnostics</h2>
                  
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center text-slate-300 text-sm font-medium">
                      <Activity size={16} className="mr-3 text-slate-400" /> Accelerometer
                    </div>
                    <span className={`text-xs font-black tracking-wider ${movementDetected ? 'text-red-400' : 'text-emerald-400'}`}>
                      {movementDetected ? 'BUMP DETECTED' : 'STABLE'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center text-slate-300 text-sm font-medium">
                      <IdCard size={16} className="mr-3 text-purple-400" /> Biometric Array
                    </div>
                    <span className={`text-xs font-black tracking-wider ${
                      rfidStatus === 'authorized' ? 'text-emerald-400' : 
                      rfidStatus === 'unauthorized' ? 'text-red-400' : 'text-slate-500'
                    }`}>
                      {rfidStatus === 'authorized' ? 'AUTHORIZED' : 
                       rfidStatus === 'unauthorized' ? 'BLOCKED' : 'IDLE'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center text-slate-300 text-sm font-medium">
                      <BellOff size={16} className="mr-3 text-slate-400" /> Audio Siren
                    </div>
                    <span className={`text-xs font-black tracking-wider ${alarmActive ? 'text-red-400' : 'text-slate-500'}`}>
                      {alarmActive ? 'ACTIVE' : 'MUTED'}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-800/50 backdrop-blur-xl p-6 rounded-3xl border border-slate-700">
                  <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center">
                    <Phone size={14} className="mr-2" />
                    SMS Alert Configuration
                  </h2>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={inputPhoneNumber}
                      onChange={(e) => setInputPhoneNumber(e.target.value)}
                      placeholder="e.g. 09123456789"
                      className="bg-slate-900 border border-slate-700 text-white text-sm rounded-xl px-4 py-2 flex-1 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                    <button 
                      onClick={handleSavePhone}
                      className="bg-blue-600 hover:bg-blue-500 text-white p-2 rounded-xl transition-colors flex items-center justify-center"
                    >
                      <Save size={18} />
                    </button>
                  </div>
                </div>
                
              </div>

              <div className="order-2 lg:order-first lg:col-span-2 space-y-6 min-w-0">
                <div className="bg-slate-800/50 backdrop-blur-xl rounded-3xl overflow-hidden shadow-2xl border border-slate-700 flex flex-col h-[450px] lg:h-[650px] relative p-2">
                  <div className="absolute top-4 left-4 sm:top-6 sm:left-6 z-10 bg-slate-900/90 backdrop-blur-md px-4 sm:px-5 py-3 rounded-2xl border border-slate-700 shadow-xl flex items-center justify-between w-[calc(100%-2rem)] sm:w-auto sm:min-w-[250px]">
                    <div className="flex items-center font-bold text-white text-sm tracking-wider">
                      <MapPin size={18} className="mr-3 text-blue-400" />
                      LIVE TRACKING
                    </div>
                    <div className="text-xs font-mono text-slate-400 ml-4">
                      {location.lat.toFixed(5)}<br/>{location.lon.toFixed(5)}
                    </div>
                  </div>

                  <div className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center opacity-20">
                    <div className="w-64 h-64 border border-blue-400 rounded-full"></div>
                    <div className="w-full h-[1px] bg-blue-400 absolute"></div>
                    <div className="h-full w-[1px] bg-blue-400 absolute"></div>
                  </div>

                  <div className="flex-1 w-full bg-slate-900 rounded-2xl overflow-hidden relative z-0">
                    <iframe 
                      title="GPS Map"
                      width="100%" 
                      height="100%" 
                      frameBorder="0" 
                      scrolling="no" 
                      marginHeight="0" 
                      marginWidth="0" 
                      src={mapSrc}
                      className="absolute inset-0 grayscale contrast-125 opacity-70 hover:opacity-100 transition-opacity duration-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'profiles' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-slate-800/50 backdrop-blur-xl p-8 rounded-3xl border border-slate-700 min-h-[600px]">
              
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-6 border-b border-slate-700/50">
                <div>
                  <h2 className="text-2xl font-black text-white tracking-wide flex items-center">
                    <Users className="mr-3 text-blue-400" size={28} />
                    Verified Profiles
                  </h2>
                  <p className="text-slate-400 text-sm mt-1">Manage active biometric tokens for vehicle access.</p>
                </div>
                
                <button 
                  onClick={handleRegisterFace}
                  disabled={isRegistering || profiles.length >= 4}
                  className={`mt-4 md:mt-0 px-6 py-3 rounded-xl font-bold text-sm tracking-wider uppercase transition-all duration-300 flex items-center shadow-lg ${
                    isRegistering 
                      ? 'bg-purple-600/50 text-white cursor-wait border border-purple-500/30' 
                      : profiles.length >= 4 
                        ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                        : 'bg-purple-600 hover:bg-purple-500 text-white shadow-purple-900/50 border border-purple-500'
                  }`}
                >
                  {isRegistering ? (
                    <>
                      <Loader2 size={18} className="mr-2 animate-spin" />
                      Hardware Processing...
                    </>
                  ) : (
                    <>
                      <UserCheck size={18} className="mr-2" />
                      Register New Profile
                    </>
                  )}
                </button>
              </div>

              {isRegistering && (
                <div className="bg-purple-900/20 border border-purple-500/30 rounded-2xl p-6 mb-8 flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center mr-4 animate-pulse">
                      <Cpu className="text-purple-400" size={24} />
                    </div>
                    <div>
                      <h3 className="text-white font-bold tracking-wide">Awaiting Hardware Scan</h3>
                      <p className="text-slate-400 text-sm">Please stand in front of the motorcycle camera. Check the OLED screen for the countdown.</p>
                    </div>
                  </div>
                </div>
              )}

              {profiles.length === 0 && !isRegistering ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                  <Users size={48} className="mb-4 opacity-50" />
                  <p className="text-lg font-medium">No biometric profiles registered.</p>
                  <p className="text-sm">Click "Register New Profile" to enroll a face.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {profiles.map((profileId, index) => (
                    <div key={profileId} className="bg-slate-900/50 border border-slate-700 rounded-2xl overflow-hidden group hover:border-slate-500 transition-all duration-300 shadow-xl">
                      <div className="aspect-square relative overflow-hidden bg-slate-800">
                        <img 
                          src={`${PYTHON_SERVER_URL}/api/image/${profileId}?t=${Date.now()}`}
                          alt={`Profile ${profileId}`}
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent"></div>
                      </div>
                      <div className="p-5">
                        <div className="flex justify-between items-center mb-4">
                          <div>
                            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest block mb-1">Slot 0{index + 1}</span>
                            <h3 className="text-white font-black tracking-wide text-lg">{profileId}</h3>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDeleteProfile(profileId)}
                          className="w-full py-2.5 bg-red-900/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 hover:border-red-500 rounded-xl font-bold text-xs tracking-wider uppercase transition-all duration-300 flex items-center justify-center"
                        >
                          <Trash2 size={14} className="mr-2" />
                          Revoke Access
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showSecretModal && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 w-full max-w-sm flex flex-col items-center text-center shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <div className="p-4 bg-blue-500/10 rounded-full mb-6">
              <Cpu className="w-12 h-12 text-blue-500" />
            </div>
            
            <h3 className="text-2xl font-black tracking-wider mb-2 text-white">DIAGNOSTIC OVERRIDE</h3>
            <p className="text-sm text-slate-400 mb-8 font-medium">Force hardware coordinate synchronization with satellite array.</p>
            
            <button 
              onClick={executeSecretSync}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold tracking-wider py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(37,99,235,0.3)] mb-4"
            >
              {syncStatus}
            </button>
            
            <button 
              onClick={() => setShowSecretModal(false)}
              className="w-full bg-transparent border border-slate-600 text-slate-400 font-bold tracking-wider py-4 rounded-xl transition-all hover:bg-slate-800 hover:text-white"
            >
              CANCEL COMMAND
            </button>
          </div>
        </div>
      )}

      {notification.show && (
        <div className={`fixed bottom-8 right-8 z-[100] px-6 py-4 rounded-2xl shadow-2xl border flex items-center gap-3 animate-in slide-in-from-right duration-300 ${
          notification.type === 'success' 
            ? 'bg-emerald-900/90 border-emerald-500 text-emerald-100' 
            : 'bg-red-900/90 border-red-500 text-red-100'
        }`}>
          {notification.type === 'success' ? <ShieldCheck /> : <XCircle />}
          <span className="font-bold tracking-wide">{notification.message}</span>
        </div>
      )}
    </div>
  );
}