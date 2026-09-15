/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
import { lazyPage } from '@/lib/lazyPage';

// Code-Splitting: Jede Seite wird erst beim Aufruf geladen (React.lazy).
// Das reduziert das initiale Bundle drastisch und beschleunigt alle Seiten.
// App.jsx rendert die Routen bereits in <Suspense> mit Fallback.
const AGB = lazyPage(() => import('./pages/AGB'));
const AuthCallback = lazyPage(() => import('./pages/AuthCallback'));
const AI = lazyPage(() => import('./pages/AI'));
const ARKnotenAssistent = lazyPage(() => import('./pages/ARKnotenAssistent'));
const ARView = lazyPage(() => import('./pages/ARView'));
const AdminUsers = lazyPage(() => import('./pages/AdminUsers'));
const Analysis = lazyPage(() => import('./pages/Analysis'));
const AngelscheinPruefungSchonzeiten = lazyPage(() => import('./pages/AngelscheinPruefungSchonzeiten'));
const BaitMixer = lazyPage(() => import('./pages/BaitMixer'));
const BathymetricCrowdsourcing = lazyPage(() => import('./pages/BathymetricCrowdsourcing'));
const CatchCam = lazyPage(() => import('./pages/CatchCam'));
const Community = lazyPage(() => import('./pages/Community'));
const Dashboard = lazyPage(() => import('./pages/Dashboard'));
const Datenschutz = lazyPage(() => import('./pages/Datenschutz'));
const DeviceIntegration = lazyPage(() => import('./pages/DeviceIntegration'));
const Devices = lazyPage(() => import('./pages/Devices'));
const Events = lazyPage(() => import('./pages/Events'));
const FunctionRatings = lazyPage(() => import('./pages/FunctionRatings'));
const Gear = lazyPage(() => import('./pages/Gear'));
const Home = lazyPage(() => import('./pages/Home'));
const Impressum = lazyPage(() => import('./pages/Impressum'));
const KiBuddyBeta = lazyPage(() => import('./pages/KiBuddyBeta'));
const Licenses = lazyPage(() => import('./pages/Licenses'));
const Logbook = lazyPage(() => import('./pages/Logbook'));
const LiveTripPage = lazyPage(() => import('./pages/LiveTripPage'));
const Map = lazyPage(() => import('./pages/Map'));
const MapPage = lazyPage(() => import('./pages/MapPage'));
const Match3Game = lazyPage(() => import('./pages/Match3Game'));
const Premium = lazyPage(() => import('./pages/Premium'));
const PremiumPlans = lazyPage(() => import('./pages/PremiumPlans'));
const Profile = lazyPage(() => import('./pages/Profile'));
const Quiz = lazyPage(() => import('./pages/Quiz'));
const Rank = lazyPage(() => import('./pages/Rank'));
const ResetPassword = lazyPage(() => import('./pages/ResetPassword'));
const Settings = lazyPage(() => import('./pages/Settings'));
const Shop = lazyPage(() => import('./pages/Shop'));
const StartFishing = lazyPage(() => import('./pages/StartFishing'));
const TripPlanner = lazyPage(() => import('./pages/TripPlanner'));
const Tutorials = lazyPage(() => import('./pages/Tutorials'));
const UsedGear = lazyPage(() => import('./pages/UsedGear'));
// VoiceChat und VoiceLecture waren fertig implementiert, aber ohne Route und
// ohne Importeur — beide Seiten waren damit gar nicht erreichbar, obwohl die
// Sprachsteuerung (voicePages.js) und die Buddy-Tipps (buddyTips.js) sie als
// Ziel führen. VoiceChat ist zudem der einzige Aufrufer von
// POST /api/ai/realtime-session, das im Backend existiert und getestet ist.
const VoiceChat = lazyPage(() => import('./pages/VoiceChat'));
const VoiceLecture = lazyPage(() => import('./pages/VoiceLecture'));
const WaterAnalysis = lazyPage(() => import('./pages/WaterAnalysis'));
const Weather = lazyPage(() => import('./pages/Weather'));
import __Layout from './Layout.jsx';


export const PAGES = {
    "AGB": AGB,
    "AuthCallback": AuthCallback,
    "AI": AI,
    "ARKnotenAssistent": ARKnotenAssistent,
    "ARView": ARView,
    "AdminUsers": AdminUsers,
    "Analysis": Analysis,
    "AngelscheinPruefungSchonzeiten": AngelscheinPruefungSchonzeiten,
    "BaitMixer": BaitMixer,
    "BathymetricCrowdsourcing": BathymetricCrowdsourcing,
    "CatchCam": CatchCam,
    "Community": Community,
    "Dashboard": Dashboard,
    "Datenschutz": Datenschutz,
    "DeviceIntegration": DeviceIntegration,
    "Devices": Devices,
    "Events": Events,
    "FunctionRatings": FunctionRatings,
    "Gear": Gear,
    "Home": Home,
    "Impressum": Impressum,
    "KiBuddyBeta": KiBuddyBeta,
    "Licenses": Licenses,
    "Logbook": Logbook,
    "LiveTrip": LiveTripPage,
    "Map": Map,
    "MapPage": MapPage,
    "Match3Game": Match3Game,
    "Premium": Premium,
    "PremiumPlans": PremiumPlans,
    "Profile": Profile,
    "Quiz": Quiz,
    "Rank": Rank,
    "ResetPassword": ResetPassword,
    "Settings": Settings,
    "Shop": Shop,
    "StartFishing": StartFishing,
    "TripPlanner": TripPlanner,
    "Tutorials": Tutorials,
    "UsedGear": UsedGear,
    "VoiceChat": VoiceChat,
    "VoiceLecture": VoiceLecture,
    "WaterAnalysis": WaterAnalysis,
    "Weather": Weather,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};