import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPin, ShieldAlert, ShieldCheck, Lock, Unlock, BellRing, BellOff,
  Wifi, WifiOff, Activity, Volume2, IdCard, Cpu, UserCheck, LayoutDashboard,
  Users, Trash2, Loader2, XCircle, Phone, Save, Power, Package, BrainCircuit, Radar, Edit2
} from 'lucide-react';

const DATABASE_URL = "https://anti-theft-system-50561-default-rtdb.asia-southeast1.firebasedatabase.app";
const SECRET = "WqaYphYJ2GmcBetMgCUp1DrU2KzGZ7toeSYD3ABt";
const PATH = `/artifacts/anti-theft-app/public/data/vehicle/status.json?auth=${SECRET}`;

const PYTHON_SERVER_URL = "http://172.20.10.9:5000"; 

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
  const [editingProfile, setEditingProfile] = useState(null);
  const [editNameValue, setEditNameValue] = useState("");
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
    const interval = setInterval(fetchProfiles, 2000);
    return () => clearInterval(interval);
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
    }, 25000);
  };

  const handleDeleteProfile = async (faceId) => {
    try {
      await fetch(`${PYTHON_SERVER_URL}/api/profiles/${faceId}`, {
        method: 'DELETE'
      });
      fetchProfiles();
    } catch (error) {}
  };

  const handleRenameSubmit = async (oldName) => {
    if (!editNameValue.trim() || editNameValue === oldName) {
      setEditingProfile(null);
      return;
    }
    try {
      await fetch(`${PYTHON_SERVER_URL}/api/profiles/${oldName}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: editNameValue.trim() })
      });
      setEditingProfile(null);
      fetchProfiles();
    } catch (error) {}
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
    <div className="min-h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans relative" style={{ width: '100vw' }}>
      
      <div className="absolute top-0 w-full h-96 bg-gradient-to-b from-blue-900/10 to-transparent pointer-events-none"></div>

      <div className="max-w-6xl mx-auto space-y-6 p-4 md:p-8 relative z-10">
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center">
          <div 
            className="flex items-center space-x-3 mb-4 md:mb-0 cursor-default select-none"
            onClick={handleLogoClick}
          >
            <div className="p-2 bg-blue-500/10 text-blue-400 rounded-2xl border border-blue-500/20 shadow-lg">
              <ShieldCheck size={28} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-widest text-white uppercase">Omnilock</h1>
              <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold flex items-center mt-0.5">
                Security Systems <span className="mx-2">•</span> {lastUpdate}
              </p>
            </div>
          </div>
          
          <div className="flex gap-4">
            <div className="flex bg-slate-900/50 p-1 rounded-2xl border border-slate-800 backdrop-blur-md overflow-x-auto">
              <button 
                onClick={() => setActiveTab('dashboard')}
                className={`px-4 md:px-6 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <LayoutDashboard size={16} className="inline mr-2" />
                Dashboard
              </button>
              <button 
                onClick={() => setActiveTab('analytics')}
                className={`px-4 md:px-6 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'analytics' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <BrainCircuit size={16} className="inline mr-2" />
                AI Security
              </button>
              <button 
                onClick={() => setActiveTab('profiles')}
                className={`px-4 md:px-6 py-2 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'profiles' ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <Users size={16} className="inline mr-2" />
                Profiles ({profiles.length}/4)
              </button>
            </div>

            <div className={`hidden md:flex items-center px-4 py-2 rounded-2xl font-bold text-xs tracking-wider transition-colors duration-500 ${isConnected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              {isConnected ? <Wifi size={14} className="mr-2" /> : <WifiOff size={14} className="mr-2" />}
              {isConnected ? 'ONLINE' : 'OFFLINE'}
            </div>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {(movementDetected || rfidStatus === 'unauthorized') && (
              <div className="bg-red-950/40 border border-red-500/30 p-5 rounded-3xl flex flex-col items-start justify-center backdrop-blur-xl shadow-2xl gap-2">
                <div className="flex items-center text-red-400 w-full">
                  <div className="p-3 bg-red-500/10 rounded-2xl mr-4">
                    <ShieldAlert size={24} className="animate-pulse" />
                  </div>
                  <div>
                    <span className="font-black text-sm tracking-wider uppercase block text-red-100">Security Breach</span>
                    <span className="text-xs text-red-300/80 mt-1 block">
                      {rfidStatus === 'unauthorized' 
                        ? 'Unauthorized biometric scan detected at ignition.' 
                        : 'Unauthorized physical movement detected.'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {rfidStatus === 'authorized' && lastVerifiedFace && (
              <div className="bg-emerald-950/30 border border-emerald-500/20 p-5 rounded-3xl flex items-center justify-between backdrop-blur-xl shadow-xl gap-4">
                <div className="flex items-center text-emerald-400">
                  <div className="p-3 bg-emerald-500/10 rounded-2xl mr-4">
                    <UserCheck size={24} />
                  </div>
                  <div>
                    <span className="font-black text-sm tracking-wider uppercase block text-emerald-100">Access Granted</span>
                    <span className="text-xs text-emerald-300/80 mt-1 block">Verified Profile: {lastVerifiedFace}</span>
                  </div>
                </div>
                <img 
                  src={`${PYTHON_SERVER_URL}/api/image/${lastVerifiedFace}`} 
                  alt="Profile" 
                  className="w-12 h-12 rounded-xl border border-emerald-500/30 object-cover"
                  onError={(e) => {e.target.style.display = 'none'}}
                />
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              
              <div className="space-y-6 order-1 xl:order-last xl:col-span-1 min-w-0">
                
                <div className="bg-slate-900/40 backdrop-blur-2xl p-8 rounded-3xl border border-white/5 flex flex-col items-center justify-center relative overflow-hidden shadow-2xl">
                  <div className={`w-28 h-28 rounded-3xl flex items-center justify-center mb-6 transition-all duration-700 relative z-10 ${
                    isLocked ? 'bg-blue-500/10 shadow-[0_0_30px_rgba(59,130,246,0.15)] text-blue-400' : 'bg-emerald-500/10 shadow-[0_0_30px_rgba(16,185,129,0.15)] text-emerald-400'
                  } ${alarmActive ? 'bg-red-500/10 shadow-[0_0_40px_rgba(239,68,68,0.2)] text-red-400 animate-pulse' : ''}`}>
                    {alarmActive ? (
                      <BellRing className="w-12 h-12" />
                    ) : isLocked ? (
                      <Lock className="w-12 h-12" />
                    ) : (
                      <Unlock className="w-12 h-12" />
                    )}
                  </div>
                  <h2 className="text-2xl font-black tracking-widest uppercase mb-2 text-white">
                    {alarmActive ? 'Triggered' : isLocked ? 'Secured' : 'Disarmed'}
                  </h2>
                  <p className="text-slate-500 text-xs font-bold tracking-wide text-center">
                    {isLocked ? 'Ignition disabled. Locks engaged.' : 'System open. Ready to start.'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={handleToggleLock}
                    className={`col-span-2 flex flex-col items-center justify-center py-6 px-2 rounded-3xl transition-all duration-300 border ${
                      isLocked 
                        ? 'bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.1)]' 
                        : 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.1)]'
                    }`}
                  >
                    <Power size={24} className="mb-3" />
                    <span className="text-[10px] font-black tracking-widest uppercase">
                      {isLocked ? 'Remote Start' : 'Kill Switch'}
                    </span>
                  </button>

                  <button 
                    onClick={() => showNotification("U-Box Solenoid Unlocked", "success")}
                    className="flex flex-col items-center justify-center py-6 px-2 bg-slate-900/40 hover:bg-slate-800/60 rounded-3xl text-slate-400 hover:text-orange-400 transition-colors border border-white/5 backdrop-blur-xl"
                  >
                    <Package size={24} className="mb-3" />
                    <span className="text-[10px] font-black tracking-widest uppercase">Open U-Box</span>
                  </button>

                  <button 
                    onClick={handleFindVehicle}
                    className="flex flex-col items-center justify-center py-6 px-2 bg-slate-900/40 hover:bg-slate-800/60 rounded-3xl text-slate-400 hover:text-indigo-400 transition-colors border border-white/5 backdrop-blur-xl"
                  >
                    <Volume2 size={24} className="mb-3" />
                    <span className="text-[10px] font-black tracking-widest uppercase">Find Vehicle</span>
                  </button>
                </div>

                <div className="bg-slate-900/40 backdrop-blur-2xl p-6 rounded-3xl border border-white/5 space-y-5">
                  <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Telemetry</h2>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center text-slate-400 text-xs font-bold">
                      <Activity size={14} className="mr-3 text-slate-500" /> Accelerometer
                    </div>
                    <span className={`text-[10px] font-black tracking-widest uppercase ${movementDetected ? 'text-red-400' : 'text-emerald-400'}`}>
                      {movementDetected ? 'Triggered' : 'Stable'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center text-slate-400 text-xs font-bold">
                      <IdCard size={14} className="mr-3 text-slate-500" /> Camera Array
                    </div>
                    <span className={`text-[10px] font-black tracking-widest uppercase ${
                      rfidStatus === 'authorized' ? 'text-emerald-400' : 
                      rfidStatus === 'unauthorized' ? 'text-red-400' : 'text-slate-500'
                    }`}>
                      {rfidStatus === 'authorized' ? 'Granted' : 
                       rfidStatus === 'unauthorized' ? 'Denied' : 'Idle'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center text-slate-400 text-xs font-bold">
                      <BellOff size={14} className="mr-3 text-slate-500" /> Audio Siren
                    </div>
                    <span className={`text-[10px] font-black tracking-widest uppercase ${alarmActive ? 'text-red-400' : 'text-slate-500'}`}>
                      {alarmActive ? 'Active' : 'Muted'}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900/40 backdrop-blur-2xl p-6 rounded-3xl border border-white/5">
                  <h2 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center">
                    <Phone size={12} className="mr-2" />
                    SMS Configuration
                  </h2>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={inputPhoneNumber}
                      onChange={(e) => setInputPhoneNumber(e.target.value)}
                      placeholder="e.g. 09123456789"
                      className="bg-slate-950/50 border border-slate-800 text-slate-300 text-xs font-mono rounded-xl px-4 py-3 flex-1 focus:outline-none focus:border-blue-500/50 transition-colors"
                    />
                    <button 
                      onClick={handleSavePhone}
                      className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/20 p-3 rounded-xl transition-colors flex items-center justify-center"
                    >
                      <Save size={16} />
                    </button>
                  </div>
                </div>
                
              </div>

              <div className="order-2 xl:order-first xl:col-span-2 space-y-6 min-w-0">
                <div className="bg-slate-900/40 backdrop-blur-2xl rounded-3xl overflow-hidden shadow-2xl border border-white/5 flex flex-col h-[500px] xl:h-full relative p-2">
                  <div className="absolute top-6 left-6 z-10 bg-slate-950/80 backdrop-blur-md px-5 py-3 rounded-2xl border border-white/10 shadow-xl flex items-center justify-between w-[calc(100%-3rem)] sm:w-auto sm:min-w-[250px]">
                    <div className="flex items-center font-black text-white text-xs tracking-widest uppercase">
                      <MapPin size={16} className="mr-3 text-blue-400" />
                      Live GPS
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 ml-4">
                      {location.lat.toFixed(5)}<br/>{location.lon.toFixed(5)}
                    </div>
                  </div>

                  <div className="flex-1 w-full bg-slate-950 rounded-2xl overflow-hidden relative z-0">
                    <iframe 
                      title="GPS Map"
                      width="100%" 
                      height="100%" 
                      frameBorder="0" 
                      scrolling="no" 
                      marginHeight="0" 
                      marginWidth="0" 
                      src={mapSrc}
                      className="absolute inset-0 grayscale contrast-125 opacity-60 hover:opacity-100 transition-opacity duration-700"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              <div className="bg-slate-900/40 backdrop-blur-2xl p-8 rounded-3xl border border-white/5 shadow-2xl">
                <div className="flex items-center mb-6">
                   <Activity className="text-blue-400 mr-4" size={28} />
                   <div>
                     <h2 className="text-lg font-black tracking-widest text-white uppercase">Motion Analyzer</h2>
                     <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">AI Classifier</p>
                   </div>
                </div>
                
                <div className="bg-slate-950/50 rounded-2xl p-5 mb-4 border border-white/5">
                    <p className="text-xs text-slate-400 font-bold mb-3 uppercase tracking-wider">Recent MPU6050 Logs</p>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center text-xs font-mono text-slate-400 border-b border-slate-800 pb-2">
                          <span className="text-emerald-400">14:02:11</span>
                          <span>AMP: 0.8G</span>
                          <span>FREQ: Low</span>
                        </div>
                        <div className="flex justify-between items-center text-xs font-mono text-slate-400 border-b border-slate-800 pb-2">
                          <span className="text-emerald-400">14:02:45</span>
                          <span>AMP: 1.2G</span>
                          <span>FREQ: Low</span>
                        </div>
                        <div className="flex justify-between items-center text-xs font-mono text-slate-400">
                          <span className="text-yellow-400">14:15:02</span>
                          <span>AMP: 3.4G</span>
                          <span>FREQ: High</span>
                        </div>
                    </div>
                </div>
                <div className="bg-blue-900/20 border border-blue-500/20 p-5 rounded-2xl">
                    <span className="block text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">AI Classification</span>
                    <span className="text-sm font-bold text-white tracking-wide">Environmental / Wind Gust</span>
                </div>
              </div>

              <div className="bg-slate-900/40 backdrop-blur-2xl p-8 rounded-3xl border border-white/5 shadow-2xl">
                <div className="flex items-center mb-6">
                   <Radar className="text-purple-400 mr-4" size={28} />
                   <div>
                     <h2 className="text-lg font-black tracking-widest text-white uppercase">Routine Tracker</h2>
                     <p className="text-slate-500 text-[10px] uppercase tracking-widest font-bold">Anomaly Detection</p>
                   </div>
                </div>
                
                 <div className="bg-slate-950/50 rounded-2xl p-5 mb-4 border border-white/5 space-y-4">
                    <div className="flex justify-between items-center">
                       <span className="text-xs text-slate-400 font-bold tracking-wider uppercase">Current Zone</span>
                       <span className="text-xs text-white font-mono bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">WMSU Campus</span>
                    </div>
                    <div className="flex justify-between items-center">
                       <span className="text-xs text-slate-400 font-bold tracking-wider uppercase">Expected Behavior</span>
                       <span className="text-[10px] text-emerald-400 font-black uppercase tracking-widest">Aligned</span>
                    </div>
                </div>
                <div className="bg-emerald-900/20 border border-emerald-500/20 p-5 rounded-2xl">
                    <span className="block text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Risk Assessment</span>
                    <span className="text-sm font-bold text-white tracking-wide">Low Risk - Routine Park</span>
                </div>
              </div>

            </div>
          </div>
        )}

        {activeTab === 'profiles' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-slate-900/40 backdrop-blur-2xl p-8 rounded-3xl border border-white/5 min-h-[600px] shadow-2xl">
              
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 pb-6 border-b border-white/5">
                <div>
                  <h2 className="text-xl font-black text-white tracking-widest uppercase flex items-center">
                    <Users className="mr-3 text-blue-400" size={24} />
                    Registered Users
                  </h2>
                  <p className="text-slate-500 text-xs font-bold tracking-wide mt-2">Manage active biometric profiles for vehicle access.</p>
                </div>
                
                <button 
                  onClick={handleRegisterFace}
                  disabled={isRegistering || profiles.length >= 4}
                  className={`mt-4 md:mt-0 px-6 py-3.5 rounded-2xl font-black text-[10px] tracking-widest uppercase transition-all duration-300 flex items-center ${
                    isRegistering 
                      ? 'bg-purple-600/20 text-purple-400 cursor-wait border border-purple-500/30' 
                      : profiles.length >= 4 
                        ? 'bg-slate-800 text-slate-600 cursor-not-allowed border border-slate-700'
                        : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 border border-purple-500/20 shadow-[0_0_20px_rgba(168,85,247,0.15)]'
                  }`}
                >
                  {isRegistering ? (
                    <>
                      <Loader2 size={16} className="mr-3 animate-spin" />
                      Hardware Processing
                    </>
                  ) : (
                    <>
                      <UserCheck size={16} className="mr-3" />
                      Enroll New Face
                    </>
                  )}
                </button>
              </div>

              {isRegistering && (
                <div className="bg-purple-950/30 border border-purple-500/20 rounded-3xl p-6 mb-8 flex items-center justify-between backdrop-blur-xl">
                  <div className="flex items-center">
                    <div className="w-12 h-12 rounded-2xl bg-purple-500/10 flex items-center justify-center mr-5 animate-pulse">
                      <Cpu className="text-purple-400" size={20} />
                    </div>
                    <div>
                      <h3 className="text-purple-100 font-black text-xs tracking-widest uppercase">Awaiting Hardware Input</h3>
                      <p className="text-purple-300/60 text-xs font-bold mt-1">Look directly at the motorcycle camera module.</p>
                    </div>
                  </div>
                </div>
              )}

              {profiles.length === 0 && !isRegistering ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-600">
                  <Users size={48} className="mb-5 opacity-20" />
                  <p className="text-sm font-black tracking-widest uppercase">No identities found</p>
                  <p className="text-xs font-bold tracking-wide mt-2">Enroll a face to enable biometric ignition.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {profiles.map((profileId, index) => (
                    <div key={profileId} className="bg-slate-950/50 border border-white/5 rounded-3xl overflow-hidden group hover:border-slate-700 transition-all duration-500 shadow-xl">
                      <div className="aspect-square relative overflow-hidden bg-slate-900 p-2">
                        <div className="w-full h-full rounded-2xl overflow-hidden relative">
                          <img 
                            src={`${PYTHON_SERVER_URL}/api/image/${profileId}?t=${Date.now()}`}
                            alt={`Profile ${profileId}`}
                            className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-500 grayscale group-hover:grayscale-0"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent"></div>
                        </div>
                      </div>
                      <div className="p-6">
                        <div className="flex justify-between items-center mb-5">
                          <div className="w-full">
                            <span className="text-[10px] font-black text-emerald-500/70 uppercase tracking-widest block mb-1">Slot 0{index + 1}</span>
                            {editingProfile === profileId ? (
                              <input
                                autoFocus
                                type="text"
                                value={editNameValue}
                                onChange={(e) => setEditNameValue(e.target.value)}
                                onBlur={() => handleRenameSubmit(profileId)}
                                onKeyDown={(e) => e.key === 'Enter' && handleRenameSubmit(profileId)}
                                className="bg-slate-800 border border-blue-500/50 text-white text-sm font-bold w-full rounded px-2 py-1 outline-none"
                              />
                            ) : (
                              <div className="flex items-center justify-between group/edit cursor-pointer w-full" onClick={() => { setEditingProfile(profileId); setEditNameValue(profileId); }}>
                                <h3 className="text-white font-bold tracking-wider text-sm truncate pr-2">{profileId}</h3>
                                <Edit2 size={14} className="text-slate-600 group-hover/edit:text-blue-400 transition-colors" />
                              </div>
                            )}
                          </div>
                        </div>
                        <button 
                          onClick={() => handleDeleteProfile(profileId)}
                          className="w-full py-3 bg-red-500/5 hover:bg-red-500/10 text-red-400 border border-red-500/10 hover:border-red-500/30 rounded-xl font-black text-[10px] tracking-widest uppercase transition-all duration-300 flex items-center justify-center"
                        >
                          <Trash2 size={14} className="mr-2" />
                          Revoke
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
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900/80 border border-white/10 rounded-3xl p-10 w-full max-w-sm flex flex-col items-center text-center shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <div className="p-5 bg-blue-500/10 rounded-3xl mb-6 shadow-inner">
              <Cpu className="w-10 h-10 text-blue-400" />
            </div>
            
            <h3 className="text-lg font-black tracking-widest mb-2 text-white uppercase">Sync Override</h3>
            <p className="text-xs text-slate-500 mb-8 font-bold leading-relaxed">Force hardware coordinate synchronization with satellite array.</p>
            
            <button 
              onClick={executeSecretSync}
              className="w-full bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-400 font-black text-[10px] tracking-widest uppercase py-4 rounded-2xl transition-all mb-3"
            >
              {syncStatus}
            </button>
            
            <button 
              onClick={() => setShowSecretModal(false)}
              className="w-full bg-transparent border border-white/5 text-slate-500 font-black text-[10px] tracking-widest uppercase py-4 rounded-2xl transition-all hover:bg-slate-800 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {notification.show && (
        <div className={`fixed bottom-8 right-8 z-[100] px-6 py-4 rounded-2xl shadow-2xl border backdrop-blur-xl flex items-center gap-4 animate-in slide-in-from-right duration-300 ${
          notification.type === 'success' 
            ? 'bg-emerald-950/80 border-emerald-500/30 text-emerald-400' 
            : 'bg-red-950/80 border-red-500/30 text-red-400'
        }`}>
          {notification.type === 'success' ? <ShieldCheck size={20} /> : <XCircle size={20} />}
          <span className="font-bold text-xs tracking-widest uppercase">{notification.message}</span>
        </div>
      )}
    </div>
  );
}