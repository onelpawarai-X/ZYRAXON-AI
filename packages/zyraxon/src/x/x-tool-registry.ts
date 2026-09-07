import { Effect, Schema } from "effect"
import type { JSONSchema7 } from "@ai-sdk/provider"
import { ATCCommunication, WeatherSystem, NOTAMSystem, RunwayConditionSystem, TCASResolution, PilotOverride, CabinPressure, EngineHealthMonitoring } from "./aviation-tools"
import { V2XCommunication, PedestrianPrediction, TrafficLightRecognition, DriverMonitoringSystem, RoadConditionSystem, CollisionImminenceSystem } from "./ground-tools"
import { GeoFencing, WindEstimation, ObstacleAvoidance3D, SwarmIntelligence, PackageDeliveryChain, AgriculturalSpraying, SearchAndRescue } from "./drone-tools"
import { LaunchWindowCalculator, GroundStationScheduler, StageRecovery, PayloadDeployment, DeorbitPlanning, ConstellationManagement, EclipsePrediction, ThermalProtection } from "./space-tools"
import { RotorController, HoverController, ExternalLoadController, AutorotationSystem, HelicopterWeatherCompensation, VerticalTakeoffLanding } from "./helicopter-tools"
import { VitalSignsMonitor, DrugInteractionChecker, PatientMonitor } from "./medical-tools"
import { PLCController, SCADAMonitor, CNCController, RoboticArmController, ConveyorController } from "./industrial-tools"
import { PowerGridController, WaterTreatmentSystem, HVACController, FireSuppressionSystem, RailwayController } from "./infrastructure-tools"
import { SurveillanceSystem, AccessControlSystem, IntrusionDetector, CyberSecurityMonitor, EncryptionEngine } from "./security-tools"
import { LiDARScanner, GPSRTK, TotalStation, DroneMapper, SeismicMonitor } from "./survey-tools"
import { SoilAnalyzer, CropMonitor, IrrigationController, PestDetector, HarvestPlanner } from "./agriculture-tools"
import { SonarSystem, NavigationChart, HullMonitor, AnchorSystem, BallastController } from "./marine-tools"
import { ExcavatorController, CraneController, ConcreteMixer, SurveyDrone, BulldozerController } from "./construction-tools"
import { ArduinoController, RaspberryPiController, CANBusController, UARTController, I2CBusController, SPIController, ADCController, PWMController } from "./physical-interface"
import { LiDARSensor, CameraSensor, RadarSensor, IMUSensor, UltrasonicSensor, ThermalSensor, AccelerometerSensor, PressureSensor } from "./sensor-tools"
import { SDRReceiver, FMTransmitter, WiFiAnalyzer, BluetoothScanner, LoRaTransceiver, GPSReceiver, SignalAnalyzer } from "./sdr-tools"
import { FailSafeSystem, WatchdogTimer, EmergencyShutdown, RedundancyManager, FMEAAnalyzer, SafetyInterlock, CircuitBreaker } from "./safety-tools"
import { VisionModel, NLPModel, PredictionEngine, ClassifierEngine, AnomalyDetector, ReinforcementLearner } from "./ml-tools"
import { TwinManager, PhysicsEngine, ScenarioRunner, StateSynchronizer, SimulationScheduler } from "./digital-twin"
import { DashboardManager, ChartEngine, StatusMonitor, RealTimeStream, WidgetFactory } from "./dashboard-tools"
import { AlertManager, NotificationEngine, EscalationPolicy, AnomalyAlerter } from "./alert-tools"
import { TimeSeriesDB, EventLogger, AuditTrail, DataExporter, StorageManager } from "./data-logger"
import { WebSocketServer, RESTAPI, NetworkAuth, RemoteSession, CommandProtocol, HeartbeatMonitor } from "./remote-control"
import { FailurePredictor, MaintenanceScheduler, SparePartsManager, VibrationAnalyzer, OilAnalyzer, ThermalTrendAnalyzer } from "./predictive-maintenance"
import { DecisionEngine, ScenarioAnalyzer, RiskAssessor, TradeoffAnalyzer, DecisionTree, CausalAnalyzer } from "./decision-support"
import { RBACManager, AuthenticationEngine, PolicyEngine, AccessLog, TokenManager, CertificateManager } from "./authorization-tools"
import { ReasoningEngine, CausalInference, WorldModel, ContextManager, AnalogyEngine, SpatialReasoning } from "./common-sense"
import { EthicalFramework, BiasDetector, FairnessAnalyzer, TransparencyEngine, SafetyValidator } from "./ethics-tools"
import { IdeaGenerator, InnovationEngine, DesignThinking, PatternSynthesizer, ConstraintRelaxer } from "./creativity-tools"

export type XToolDef = {
  id: string
  name: string
  description: string
  parameters: Record<string, { type: string; description: string; required?: boolean }>
  category: string
  execute: (args: any) => Promise<{ ok: boolean; data?: any; error?: string }>
}

export const xToolRegistry: XToolDef[] = [

  // ═══════════════════════════════════════════════════════════════════════════
  // AVIATION (24 tools)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "x_atc_connect",
    name: "ATC Connect",
    description: "Connect to an ATC frequency with a callsign.",
    parameters: {
      callsign: { type: "string", description: "Aircraft callsign (min 2 chars)", required: true },
      frequency: { type: "number", description: "Radio frequency in MHz (118.000-136.975)", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const atc = new ATCCommunication()
      return atc.connect(args.callsign, args.frequency)
    },
  },
  {
    id: "x_atc_disconnect",
    name: "ATC Disconnect",
    description: "Disconnect from the current ATC frequency.",
    parameters: {},
    category: "aviation",
    execute: async () => {
      const atc = new ATCCommunication()
      return atc.disconnect()
    },
  },
  {
    id: "x_atc_tune",
    name: "ATC Tune Frequency",
    description: "Tune to a new ATC frequency.",
    parameters: {
      frequency: { type: "number", description: "New frequency in MHz (118-137)", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const atc = new ATCCommunication()
      return atc.tune(args.frequency)
    },
  },
  {
    id: "x_atc_set_squawk",
    name: "ATC Set Squawk",
    description: "Set the transponder squawk code.",
    parameters: {
      code: { type: "string", description: "4-digit squawk code (0-7)", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const atc = new ATCCommunication()
      return atc.setSquawk(args.code)
    },
  },
  {
    id: "x_atc_request_clearance",
    name: "ATC Request Clearance",
    description: "Request flight clearance from ATC.",
    parameters: {
      type: { type: "string", description: "Clearance type: takeoff, landing, approach, taxi, departure, cruise, diversion", required: true },
      details: { type: "string", description: "Clearance details (e.g. runway number)", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const atc = new ATCCommunication()
      return atc.requestClearance(args.type, args.details)
    },
  },
  {
    id: "x_atc_read_back",
    name: "ATC Read Back",
    description: "Read back an ATC clearance.",
    parameters: {
      clearance: { type: "string", description: "The clearance text to read back", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const atc = new ATCCommunication()
      return atc.readBack(args.clearance)
    },
  },
  {
    id: "x_atc_declare_emergency",
    name: "ATC Declare Emergency",
    description: "Declare an aviation emergency (mayday, pan-pan, securite).",
    parameters: {
      type: { type: "string", description: "Emergency type: mayday, pan-pan, securite", required: true },
      reason: { type: "string", description: "Reason for the emergency", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const atc = new ATCCommunication()
      return atc.declareEmergency(args.type, args.reason)
    },
  },
  {
    id: "x_weather_parse_metar",
    name: "Parse METAR",
    description: "Parse a raw METAR weather report string.",
    parameters: {
      raw: { type: "string", description: "Raw METAR string", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const ws = new WeatherSystem()
      return ws.parseMETAR(args.raw)
    },
  },
  {
    id: "x_weather_check_turbulence",
    name: "Check Turbulence",
    description: "Check turbulence severity at a given location and altitude.",
    parameters: {
      lat: { type: "number", description: "Latitude", required: true },
      lon: { type: "number", description: "Longitude", required: true },
      alt: { type: "number", description: "Altitude in feet", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const ws = new WeatherSystem()
      return ws.checkTurbulence(args.lat, args.lon, args.alt)
    },
  },
  {
    id: "x_weather_check_icing",
    name: "Check Icing Conditions",
    description: "Check icing risk at a given position and temperature.",
    parameters: {
      lat: { type: "number", description: "Latitude", required: true },
      lon: { type: "number", description: "Longitude", required: true },
      alt: { type: "number", description: "Altitude in feet", required: true },
      temp: { type: "number", description: "Temperature in Celsius", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const ws = new WeatherSystem()
      return ws.checkIcing(args.lat, args.lon, args.alt, args.temp)
    },
  },
  {
    id: "x_weather_get_winds_aloft",
    name: "Get Winds Aloft",
    description: "Get wind direction, speed, and temperature at altitude.",
    parameters: {
      alt: { type: "number", description: "Altitude in feet", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const ws = new WeatherSystem()
      return ws.getWindsAloft(args.alt)
    },
  },
  {
    id: "x_notam_add",
    name: "Add NOTAM",
    description: "Add a Notice to Airmen for an airport or airspace.",
    parameters: {
      airport: { type: "string", description: "Airport ICAO code", required: true },
      description: { type: "string", description: "NOTAM description", required: true },
      airspace: { type: "string", description: "Affected airspace (optional)" },
      runway: { type: "string", description: "Affected runway (optional)" },
      critical: { type: "boolean", description: "Whether this NOTAM is critical" },
      validFrom: { type: "number", description: "Valid from timestamp" },
      validUntil: { type: "number", description: "Valid until timestamp" },
    },
    category: "aviation",
    execute: async (args) => {
      const ns = new NOTAMSystem()
      return ns.addNOTAM(args)
    },
  },
  {
    id: "x_notam_get_by_location",
    name: "Get NOTAMs by Airport",
    description: "Retrieve all NOTAMs for a specific airport.",
    parameters: {
      airport: { type: "string", description: "Airport ICAO code", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const ns = new NOTAMSystem()
      return ns.getByLocation(args.airport)
    },
  },
  {
    id: "x_notam_check_runway",
    name: "Check Runway NOTAMs",
    description: "Check if a runway is closed or restricted via NOTAMs.",
    parameters: {
      airport: { type: "string", description: "Airport ICAO code", required: true },
      runway: { type: "string", description: "Runway identifier", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const ns = new NOTAMSystem()
      return ns.checkRunwayStatus(args.airport, args.runway)
    },
  },
  {
    id: "x_runway_set_condition",
    name: "Set Runway Condition",
    description: "Set runway surface condition and friction coefficient.",
    parameters: {
      airport: { type: "string", description: "Airport ICAO code", required: true },
      runway: { type: "string", description: "Runway identifier", required: true },
      condition: { type: "string", description: "Surface condition (DRY, WET, CONTAMINATED-SNOW, etc.)", required: true },
      friction: { type: "number", description: "Friction coefficient (0-1)", required: true },
      contamination: { type: "string", description: "Type of contamination", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const rc = new RunwayConditionSystem()
      return rc.setCondition(args.airport, args.runway, args.condition, args.friction, args.contamination)
    },
  },
  {
    id: "x_runway_calc_landing_distance",
    name: "Calculate Landing Distance",
    description: "Calculate required landing distance based on runway conditions.",
    parameters: {
      airport: { type: "string", description: "Airport ICAO code", required: true },
      runway: { type: "number", description: "Runway number", required: true },
      weight: { type: "number", description: "Aircraft weight in kg", required: true },
      speed: { type: "number", description: "Approach speed in knots", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const rc = new RunwayConditionSystem()
      return rc.calculateLandingDistance(args.airport, args.runway, args.weight, args.speed)
    },
  },
  {
    id: "x_runway_get_braking",
    name: "Get Braking Recommendation",
    description: "Get autobrake and reverse thrust recommendation for a runway.",
    parameters: {
      airport: { type: "string", description: "Airport ICAO code", required: true },
      runway: { type: "string", description: "Runway identifier", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const rc = new RunwayConditionSystem()
      return rc.getBrakingRecommendation(args.airport, args.runway)
    },
  },
  {
    id: "x_tcas_detect_traffic",
    name: "TCAS Detect Traffic",
    description: "Detect and classify air traffic near own aircraft.",
    parameters: {
      own: { type: "object", description: "Own position: {callsign, lat, lon, alt, heading, speed}", required: true },
      intruder: { type: "object", description: "Intruder position: {callsign, lat, lon, alt, heading, speed}", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const tcas = new TCASResolution()
      return tcas.detectTraffic(args.own, args.intruder)
    },
  },
  {
    id: "x_tcas_calculate_resolution",
    name: "TCAS Calculate Resolution",
    description: "Calculate TCAS resolution advisory for detected traffic.",
    parameters: {},
    category: "aviation",
    execute: async () => {
      const tcas = new TCASResolution()
      return tcas.calculateResolution()
    },
  },
  {
    id: "x_pilot_request_override",
    name: "Pilot Request Override",
    description: "Request pilot manual override of AI flight controls.",
    parameters: {
      reason: { type: "string", description: "Reason for the override request", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const po = new PilotOverride()
      return po.requestOverride(args.reason)
    },
  },
  {
    id: "x_pilot_release_override",
    name: "Pilot Release Override",
    description: "Release pilot override and resume AI control.",
    parameters: {},
    category: "aviation",
    execute: async () => {
      const po = new PilotOverride()
      return po.releaseOverride()
    },
  },
  {
    id: "x_cabin_set_altitude",
    name: "Set Cabin Altitude",
    description: "Set the target cabin pressurization altitude.",
    parameters: {
      target: { type: "number", description: "Target cabin altitude in feet (0-50000)", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const cp = new CabinPressure()
      return cp.setAltitude(args.target)
    },
  },
  {
    id: "x_cabin_detect_decompression",
    name: "Detect Decompression",
    description: "Check for rapid or slow cabin decompression.",
    parameters: {},
    category: "aviation",
    execute: async () => {
      const cp = new CabinPressure()
      return cp.detectDecompression()
    },
  },
  {
    id: "x_engine_add",
    name: "Add Engine",
    description: "Register an engine for health monitoring.",
    parameters: {
      id: { type: "string", description: "Engine identifier", required: true },
      type: { type: "string", description: "Engine type (e.g. turbofan, turboprop)", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const ehm = new EngineHealthMonitoring()
      return ehm.addEngine(args.id, args.type)
    },
  },
  {
    id: "x_engine_check_health",
    name: "Check Engine Health",
    description: "Perform health check on a specific engine.",
    parameters: {
      engineId: { type: "string", description: "Engine identifier", required: true },
    },
    category: "aviation",
    execute: async (args) => {
      const ehm = new EngineHealthMonitoring()
      return ehm.checkHealth(args.engineId)
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GROUND (18 tools)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "x_v2x_connect",
    name: "V2X Connect",
    description: "Establish a V2X communication connection.",
    parameters: {
      protocol: { type: "string", description: "Communication protocol (DSRC, C-V2X, etc.)", required: true },
    },
    category: "ground",
    execute: async (args) => {
      const v2x = new V2XCommunication()
      return v2x.connect(args.protocol)
    },
  },
  {
    id: "x_v2x_send_v2v",
    name: "V2X Send V2V",
    description: "Send a vehicle-to-vehicle message.",
    parameters: {
      targetId: { type: "string", description: "Target vehicle ID", required: true },
      msg: { type: "object", description: "Message payload", required: true },
    },
    category: "ground",
    execute: async (args) => {
      const v2x = new V2XCommunication()
      return v2x.sendV2V(args.targetId, args.msg)
    },
  },
  {
    id: "x_v2x_send_v2i",
    name: "V2X Send V2I",
    description: "Send a vehicle-to-infrastructure message.",
    parameters: {
      infrastructureId: { type: "string", description: "Infrastructure node ID", required: true },
      msg: { type: "object", description: "Message payload", required: true },
    },
    category: "ground",
    execute: async (args) => {
      const v2x = new V2XCommunication()
      return v2x.sendV2I(args.infrastructureId, args.msg)
    },
  },
  {
    id: "x_pedestrian_add",
    name: "Add Pedestrian",
    description: "Track a pedestrian with position, velocity, and intent.",
    parameters: {
      id: { type: "string", description: "Pedestrian ID", required: true },
      x: { type: "number", description: "X position", required: true },
      y: { type: "number", description: "Y position", required: true },
      vx: { type: "number", description: "X velocity", required: true },
      vy: { type: "number", description: "Y velocity", required: true },
      intent: { type: "string", description: "Intent (crossing, stopping, turning, unknown)", required: true },
    },
    category: "ground",
    execute: async (args) => {
      const pp = new PedestrianPrediction()
      return pp.addPedestrian(args.id, args.x, args.y, args.vx, args.vy, args.intent)
    },
  },
  {
    id: "x_pedestrian_predict",
    name: "Predict Pedestrian Path",
    description: "Predict pedestrian path over a time horizon.",
    parameters: {
      id: { type: "string", description: "Pedestrian ID", required: true },
      horizonSec: { type: "number", description: "Prediction horizon in seconds", required: true },
    },
    category: "ground",
    execute: async (args) => {
      const pp = new PedestrianPrediction()
      return pp.predictPath(args.id, args.horizonSec)
    },
  },
  {
    id: "x_pedestrian_risk",
    name: "Pedestrian Risk Assessment",
    description: "Assess collision risk between pedestrian and vehicle path.",
    parameters: {
      id: { type: "string", description: "Pedestrian ID", required: true },
      vehiclePath: { type: "array", description: "Vehicle path as [{x, y}, ...]", required: true },
    },
    category: "ground",
    execute: async (args) => {
      const pp = new PedestrianPrediction()
      return pp.assessRisk(args.id, args.vehiclePath)
    },
  },
  {
    id: "x_traffic_set_signal",
    name: "Set Traffic Signal",
    description: "Configure a traffic light intersection signal phases.",
    parameters: {
      intersectionId: { type: "string", description: "Intersection ID", required: true },
      state: { type: "string", description: "Current signal state (green, yellow, red)", required: true },
      timing: { type: "object", description: "Timing config: {phases: [{state, duration}]}", required: true },
    },
    category: "ground",
    execute: async (args) => {
      const tlr = new TrafficLightRecognition()
      return tlr.setSignal(args.intersectionId, args.state, args.timing)
    },
  },
  {
    id: "x_traffic_should_proceed",
    name: "Traffic Should Proceed",
    description: "Determine if a vehicle should proceed through an intersection.",
    parameters: {
      intersectionId: { type: "string", description: "Intersection ID", required: true },
      vehicleSpeed: { type: "number", description: "Vehicle speed in m/s", required: true },
      distance: { type: "number", description: "Distance to intersection in meters", required: true },
    },
    category: "ground",
    execute: async (args) => {
      const tlr = new TrafficLightRecognition()
      return tlr.shouldProceed(args.intersectionId, args.vehicleSpeed, args.distance)
    },
  },
  {
    id: "x_traffic_recommended_speed",
    name: "Get Recommended Speed",
    description: "Get recommended speed for approaching a traffic signal.",
    parameters: {
      intersectionId: { type: "string", description: "Intersection ID", required: true },
      distance: { type: "number", description: "Distance to intersection in meters", required: true },
    },
    category: "ground",
    execute: async (args) => {
      const tlr = new TrafficLightRecognition()
      return tlr.getRecommendedSpeed(args.intersectionId, args.distance)
    },
  },
  {
    id: "x_dms_update",
    name: "Update Driver Metrics",
    description: "Update driver face metrics for monitoring system.",
    parameters: {
      eyeOpen: { type: "number", description: "Eye openness (0-1)", required: true },
      gaze: { type: "object", description: "Gaze direction: {x, y}", required: true },
      headPose: { type: "object", description: "Head pose: {pitch, yaw, roll}", required: true },
    },
    category: "ground",
    execute: async (args) => {
      const dms = new DriverMonitoringSystem()
      return dms.updateFaceMetrics(args.eyeOpen, args.gaze, args.headPose)
    },
  },
  {
    id: "x_dms_get_alertness",
    name: "Get Driver Alertness",
    description: "Get current driver alertness level.",
    parameters: {},
    category: "ground",
    execute: async () => {
      const dms = new DriverMonitoringSystem()
      return dms.getAlertness()
    },
  },
  {
    id: "x_dms_get_fatigue",
    name: "Get Driver Fatigue",
    description: "Get current driver fatigue level.",
    parameters: {},
    category: "ground",
    execute: async () => {
      const dms = new DriverMonitoringSystem()
      return dms.getFatigue()
    },
  },
  {
    id: "x_road_update_friction",
    name: "Update Road Friction",
    description: "Update road friction measurement from sensor.",
    parameters: {
      value: { type: "number", description: "Friction value (0-1)", required: true },
      x: { type: "number", description: "X coordinate", required: true },
      y: { type: "number", description: "Y coordinate", required: true },
      source: { type: "string", description: "Sensor source name" },
    },
    category: "ground",
    execute: async (args) => {
      const rcs = new RoadConditionSystem()
      return rcs.updateFriction(args)
    },
  },
  {
    id: "x_road_detect_hazard",
    name: "Detect Road Hazard",
    description: "Report a detected road hazard (pothole, standing water).",
    parameters: {
      type: { type: "string", description: "Hazard type (pothole, water)", required: true },
      x: { type: "number", description: "X coordinate", required: true },
      y: { type: "number", description: "Y coordinate", required: true },
      severity: { type: "number", description: "Severity (0-1)", required: true },
    },
    category: "ground",
    execute: async (args) => {
      const rcs = new RoadConditionSystem()
      if (args.type === "water") return rcs.detectStandingWater(args.x, args.y, args.severity)
      return rcs.detectPothole(args.x, args.y, args.severity)
    },
  },
  {
    id: "x_road_get_recommendation",
    name: "Get Road Recommendation",
    description: "Get speed recommendation based on road conditions.",
    parameters: {
      speed: { type: "number", description: "Current speed in km/h", required: true },
    },
    category: "ground",
    execute: async (args) => {
      const rcs = new RoadConditionSystem()
      return rcs.getRecommendation(args.speed)
    },
  },
  {
    id: "x_collision_calc_ttc",
    name: "Calculate Time-to-Collision",
    description: "Calculate time-to-collision with a tracked object.",
    parameters: {
      objectId: { type: "string", description: "Object ID to calculate TTC for", required: true },
    },
    category: "ground",
    execute: async (args) => {
      const cis = new CollisionImminenceSystem()
      return cis.calculateTTC(args.objectId)
    },
  },
  {
    id: "x_collision_should_brake",
    name: "Should Brake",
    description: "Determine if emergency braking is needed.",
    parameters: {},
    category: "ground",
    execute: async () => {
      const cis = new CollisionImminenceSystem()
      return cis.shouldBrake()
    },
  },
  {
    id: "x_collision_should_evade",
    name: "Should Evade",
    description: "Determine if evasive maneuver is needed beyond braking.",
    parameters: {},
    category: "ground",
    execute: async () => {
      const cis = new CollisionImminenceSystem()
      return cis.shouldEvade()
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // DRONE (21 tools)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "x_geofence_add_zone",
    name: "Add Geofence Zone",
    description: "Add a no-fly geofence zone.",
    parameters: {
      id: { type: "string", description: "Zone ID", required: true },
      type: { type: "string", description: "Zone type (airport, military, government, restricted, temporary)", required: true },
      center: { type: "object", description: "Center: {lat, lon}", required: true },
      radius: { type: "number", description: "Radius in meters", required: true },
      altMin: { type: "number", description: "Minimum altitude in feet", required: true },
      altMax: { type: "number", description: "Maximum altitude in feet", required: true },
    },
    category: "drone",
    execute: async (args) => {
      const gf = new GeoFencing()
      return gf.addZone(args.id, args.type, args.center, args.radius, args.altMin, args.altMax)
    },
  },
  {
    id: "x_geofence_check",
    name: "Check Geofence Position",
    description: "Check if a position violates any geofence zone.",
    parameters: {
      lat: { type: "number", description: "Latitude", required: true },
      lon: { type: "number", description: "Longitude", required: true },
      alt: { type: "number", description: "Altitude in feet", required: true },
    },
    category: "drone",
    execute: async (args) => {
      const gf = new GeoFencing()
      return gf.checkPosition(args.lat, args.lon, args.alt)
    },
  },
  {
    id: "x_geofence_violations",
    name: "Get Geofence Violations",
    description: "Get all defined geofence zones.",
    parameters: {},
    category: "drone",
    execute: async () => {
      const gf = new GeoFencing()
      return gf.getViolations()
    },
  },
  {
    id: "x_wind_update_imu",
    name: "Update Wind from IMU",
    description: "Estimate wind from IMU data (pitch, roll, throttle, velocity).",
    parameters: {
      pitch: { type: "number", description: "Pitch angle in degrees", required: true },
      roll: { type: "number", description: "Roll angle in degrees", required: true },
      throttle: { type: "number", description: "Throttle level (0-1)", required: true },
      velocity: { type: "object", description: "Velocity: {x, y, z}", required: true },
    },
    category: "drone",
    execute: async (args) => {
      const we = new WindEstimation()
      return we.updateFromIMU(args.pitch, args.roll, args.throttle, args.velocity)
    },
  },
  {
    id: "x_wind_update_gps",
    name: "Update Wind from GPS",
    description: "Estimate wind from GPS and airspeed data.",
    parameters: {
      groundSpeed: { type: "number", description: "Ground speed in m/s", required: true },
      groundTrack: { type: "number", description: "Ground track in degrees", required: true },
      airspeed: { type: "number", description: "Airspeed in m/s", required: true },
      heading: { type: "number", description: "Heading in degrees", required: true },
    },
    category: "drone",
    execute: async (args) => {
      const we = new WindEstimation()
      return we.updateFromGPS(args.groundSpeed, args.groundTrack, args.airspeed, args.heading)
    },
  },
  {
    id: "x_wind_get_vector",
    name: "Get Wind Vector",
    description: "Get estimated wind vector from accumulated samples.",
    parameters: {},
    category: "drone",
    execute: async () => {
      const we = new WindEstimation()
      return we.getWindVector()
    },
  },
  {
    id: "x_obstacle_add_3d",
    name: "Add 3D Obstacle",
    description: "Register a 3D obstacle for avoidance.",
    parameters: {
      id: { type: "string", description: "Obstacle ID", required: true },
      x: { type: "number", description: "X position", required: true },
      y: { type: "number", description: "Y position", required: true },
      z: { type: "number", description: "Z position", required: true },
      radius: { type: "number", description: "Obstacle radius", required: true },
      velocity: { type: "object", description: "Velocity: {x, y, z}", required: true },
    },
    category: "drone",
    execute: async (args) => {
      const oa = new ObstacleAvoidance3D()
      return oa.addObstacle(args.id, args.x, args.y, args.z, args.radius, args.velocity)
    },
  },
  {
    id: "x_obstacle_get_avoidance",
    name: "Get Avoidance Vector",
    description: "Calculate avoidance vector toward target avoiding obstacles.",
    parameters: {
      dronePos: { type: "object", description: "Drone position: {x, y, z}", required: true },
      droneVel: { type: "object", description: "Drone velocity: {x, y, z}", required: true },
      targetPos: { type: "object", description: "Target position: {x, y, z}", required: true },
    },
    category: "drone",
    execute: async (args) => {
      const oa = new ObstacleAvoidance3D()
      return oa.getAvoidanceVector(args.dronePos, args.droneVel, args.targetPos)
    },
  },
  {
    id: "x_obstacle_find_path",
    name: "Find Safe Path",
    description: "Find a collision-free path between two points.",
    parameters: {
      from: { type: "object", description: "Start position: {x, y, z}", required: true },
      to: { type: "object", description: "End position: {x, y, z}", required: true },
    },
    category: "drone",
    execute: async (args) => {
      const oa = new ObstacleAvoidance3D()
      return oa.findSafePath(args.from, args.to)
    },
  },
  {
    id: "x_swarm_add_drone",
    name: "Add Swarm Drone",
    description: "Add a drone to the swarm formation.",
    parameters: {
      id: { type: "string", description: "Drone ID", required: true },
      pos: { type: "object", description: "Position: {x, y, z}", required: true },
    },
    category: "drone",
    execute: async (args) => {
      const si = new SwarmIntelligence()
      return si.addDrone(args.id, args.pos)
    },
  },
  {
    id: "x_swarm_consensus",
    name: "Swarm Consensus",
    description: "Compute swarm centroid and consensus movement.",
    parameters: {},
    category: "drone",
    execute: async () => {
      const si = new SwarmIntelligence()
      return si.computeConsensus()
    },
  },
  {
    id: "x_swarm_leader_election",
    name: "Swarm Leader Election",
    description: "Elect a swarm leader based on highest altitude.",
    parameters: {},
    category: "drone",
    execute: async () => {
      const si = new SwarmIntelligence()
      return si.getLeaderElection()
    },
  },
  {
    id: "x_delivery_create",
    name: "Create Delivery Shipment",
    description: "Create a new package delivery shipment.",
    parameters: {
      id: { type: "string", description: "Shipment ID", required: true },
      from: { type: "string", description: "Origin", required: true },
      to: { type: "string", description: "Destination", required: true },
      package: { type: "object", description: "Package details", required: true },
    },
    category: "drone",
    execute: async (args) => {
      const pdc = new PackageDeliveryChain()
      return pdc.createShipment(args.id, args.from, args.to, args.package)
    },
  },
  {
    id: "x_delivery_assign",
    name: "Assign Delivery Drone",
    description: "Assign a drone to a delivery shipment.",
    parameters: {
      droneId: { type: "string", description: "Drone ID", required: true },
      shipmentId: { type: "string", description: "Shipment ID", required: true },
    },
    category: "drone",
    execute: async (args) => {
      const pdc = new PackageDeliveryChain()
      return pdc.assignDrone(args.droneId, args.shipmentId)
    },
  },
  {
    id: "x_delivery_track",
    name: "Track Delivery",
    description: "Get chain of custody for a delivery shipment.",
    parameters: {
      shipmentId: { type: "string", description: "Shipment ID", required: true },
    },
    category: "drone",
    execute: async (args) => {
      const pdc = new PackageDeliveryChain()
      return pdc.getChainOfCustody(args.shipmentId)
    },
  },
  {
    id: "x_spray_set_field",
    name: "Set Spray Field",
    description: "Set field boundary for agricultural spraying.",
    parameters: {
      boundary: { type: "object", description: "Field boundary: {points: [{x, y}]}", required: true },
    },
    category: "drone",
    execute: async (args) => {
      const as = new AgriculturalSpraying()
      return as.setField(args.boundary)
    },
  },
  {
    id: "x_spray_plan_swath",
    name: "Plan Spray Swath",
    description: "Plan spray swath pattern over the field.",
    parameters: {
      field: { type: "object", description: "Field boundary: {points: [{x, y}]}", required: true },
      spacing: { type: "number", description: "Swath spacing in meters", required: true },
    },
    category: "drone",
    execute: async (args) => {
      const as = new AgriculturalSpraying()
      return as.planSwath(args.field, args.spacing)
    },
  },
  {
    id: "x_spray_get_coverage",
    name: "Get Spray Coverage",
    description: "Get spraying coverage efficiency statistics.",
    parameters: {},
    category: "drone",
    execute: async () => {
      const as = new AgriculturalSpraying()
      return as.getEfficiency()
    },
  },
  {
    id: "x_sar_set_area",
    name: "Set SAR Area",
    description: "Define search and rescue area boundary.",
    parameters: {
      boundary: { type: "object", description: "SAR area: {points: [{x, y}]}", required: true },
    },
    category: "drone",
    execute: async (args) => {
      const sar = new SearchAndRescue()
      return sar.setArea(args.boundary)
    },
  },
  {
    id: "x_sar_plan_grid",
    name: "Plan Grid Search",
    description: "Plan grid search pattern for SAR.",
    parameters: {
      droneCount: { type: "number", description: "Number of drones", required: true },
      altitude: { type: "number", description: "Search altitude in meters", required: true },
    },
    category: "drone",
    execute: async (args) => {
      const sar = new SearchAndRescue()
      return sar.planGridSearch(args.droneCount, args.altitude)
    },
  },
  {
    id: "x_sar_plan_spiral",
    name: "Plan Spiral Search",
    description: "Plan spiral search pattern from a center point.",
    parameters: {
      center: { type: "object", description: "Center: {x, y}", required: true },
      radius: { type: "number", description: "Search radius in meters", required: true },
    },
    category: "drone",
    execute: async (args) => {
      const sar = new SearchAndRescue()
      return sar.planSpiralSearch(args.center, args.radius)
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SPACE (24 tools)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "x_launch_calc_window",
    name: "Calculate Launch Window",
    description: "Calculate launch window for a target orbit.",
    parameters: {
      date: { type: "object", description: "Target date", required: true },
      targetOrbit: { type: "object", description: "Target orbit: {altitude, inclination}", required: true },
      vehicle: { type: "string", description: "Vehicle name (optional)" },
    },
    category: "space",
    execute: async (args) => {
      const lwc = new LaunchWindowCalculator()
      return lwc.calculateWindow(args.date, args.targetOrbit, args.vehicle)
    },
  },
  {
    id: "x_launch_get_next",
    name: "Get Next Launch Window",
    description: "Find the next available launch window within 14 days.",
    parameters: {
      targetOrbit: { type: "object", description: "Target orbit: {altitude, inclination}", required: true },
    },
    category: "space",
    execute: async (args) => {
      const lwc = new LaunchWindowCalculator()
      return lwc.getNextWindow(args.targetOrbit)
    },
  },
  {
    id: "x_launch_check_constraints",
    name: "Check Launch Constraints",
    description: "Verify weather, range, and traffic constraints for launch.",
    parameters: {
      launchTime: { type: "object", description: "Proposed launch time", required: true },
      constraints: { type: "object", description: "Constraints: {weather: {maxWind, maxPrecip}, range, traffic}", required: true },
    },
    category: "space",
    execute: async (args) => {
      const lwc = new LaunchWindowCalculator()
      return lwc.checkConstraints(args.launchTime, args.constraints)
    },
  },
  {
    id: "x_ground_station_add",
    name: "Add Ground Station",
    description: "Register a ground station for satellite communication.",
    parameters: {
      id: { type: "string", description: "Station ID", required: true },
      lat: { type: "number", description: "Latitude", required: true },
      lon: { type: "number", description: "Longitude", required: true },
      freq: { type: "number", description: "Communication frequency in MHz", required: true },
    },
    category: "space",
    execute: async (args) => {
      const gss = new GroundStationScheduler()
      return gss.addStation(args.id, args.lat, args.lon, args.freq)
    },
  },
  {
    id: "x_ground_station_schedule",
    name: "Schedule Ground Station Pass",
    description: "Schedule a satellite pass over a ground station.",
    parameters: {
      satId: { type: "string", description: "Satellite ID", required: true },
      stationId: { type: "string", description: "Ground station ID", required: true },
      startTime: { type: "object", description: "Pass start time", required: true },
      duration: { type: "number", description: "Duration in minutes", required: true },
    },
    category: "space",
    execute: async (args) => {
      const gss = new GroundStationScheduler()
      return gss.schedulePass(args.satId, args.stationId, args.startTime, args.duration)
    },
  },
  {
    id: "x_ground_station_next_pass",
    name: "Get Next Pass",
    description: "Get the next satellite pass for a given satellite.",
    parameters: {
      satId: { type: "string", description: "Satellite ID", required: true },
    },
    category: "space",
    execute: async (args) => {
      const gss = new GroundStationScheduler()
      return gss.getNextPass(args.satId)
    },
  },
  {
    id: "x_stage_separate",
    name: "Separate Stage",
    description: "Initiate rocket stage separation.",
    parameters: {
      stage: { type: "object", description: "Stage: {id, mass}", required: true },
      altitude: { type: "number", description: "Separation altitude in km", required: true },
      velocity: { type: "number", description: "Velocity at separation in m/s", required: true },
    },
    category: "space",
    execute: async (args) => {
      const sr = new StageRecovery()
      return sr.separateStage(args.stage, args.altitude, args.velocity)
    },
  },
  {
    id: "x_stage_deploy_chutes",
    name: "Deploy Stage Chutes",
    description: "Deploy parachutes for stage recovery.",
    parameters: {
      stageId: { type: "string", description: "Stage ID", required: true },
      altitude: { type: "number", description: "Current altitude in meters", required: true },
    },
    category: "space",
    execute: async (args) => {
      const sr = new StageRecovery()
      return sr.deployChutes(args.stageId, args.altitude)
    },
  },
  {
    id: "x_stage_touchdown",
    name: "Stage Touchdown",
    description: "Record stage landing touchdown position.",
    parameters: {
      stageId: { type: "string", description: "Stage ID", required: true },
      position: { type: "object", description: "Landing position: {lat, lon}", required: true },
    },
    category: "space",
    execute: async (args) => {
      const sr = new StageRecovery()
      return sr.touchdown(args.stageId, args.position)
    },
  },
  {
    id: "x_payload_create",
    name: "Create Payload",
    description: "Create a satellite payload for deployment.",
    parameters: {
      id: { type: "string", description: "Payload ID", required: true },
      type: { type: "string", description: "Payload type", required: true },
      mass: { type: "number", description: "Mass in kg", required: true },
      orbit: { type: "object", description: "Target orbit: {altitude, inclination}", required: true },
    },
    category: "space",
    execute: async (args) => {
      const pd = new PayloadDeployment()
      return pd.createPayload(args.id, args.type, args.mass, args.orbit)
    },
  },
  {
    id: "x_payload_deploy",
    name: "Deploy Payload",
    description: "Deploy a payload from the launch vehicle.",
    parameters: {
      payloadId: { type: "string", description: "Payload ID", required: true },
      time: { type: "object", description: "Deployment time", required: true },
      conditions: { type: "object", description: "Conditions: {attitude, separation}", required: true },
    },
    category: "space",
    execute: async (args) => {
      const pd = new PayloadDeployment()
      return pd.deploy(args.payloadId, args.time, args.conditions)
    },
  },
  {
    id: "x_payload_confirm",
    name: "Confirm Payload Orbit",
    description: "Confirm payload has achieved target orbit.",
    parameters: {
      payloadId: { type: "string", description: "Payload ID", required: true },
    },
    category: "space",
    execute: async (args) => {
      const pd = new PayloadDeployment()
      return pd.confirmOrbit(args.payloadId)
    },
  },
  {
    id: "x_deorbit_calc_burn",
    name: "Calculate Deorbit Burn",
    description: "Calculate deorbit burn parameters for re-entry.",
    parameters: {
      currentOrbit: { type: "object", description: "Current orbit: {altitude, inclination}", required: true },
      targetLanding: { type: "object", description: "Target landing: {lat, lon}", required: true },
    },
    category: "space",
    execute: async (args) => {
      const dop = new DeorbitPlanning()
      return dop.calculateDeorbitBurn(args.currentOrbit, args.targetLanding)
    },
  },
  {
    id: "x_deorbit_get_window",
    name: "Get Deorbit Window",
    description: "Get deorbit window for a target landing site.",
    parameters: {
      targetSite: { type: "object", description: "Target site: {lat, lon}", required: true },
    },
    category: "space",
    execute: async (args) => {
      const dop = new DeorbitPlanning()
      return dop.getDeorbitWindow(args.targetSite)
    },
  },
  {
    id: "x_constellation_add_sat",
    name: "Add Satellite to Constellation",
    description: "Add a satellite to the constellation.",
    parameters: {
      id: { type: "string", description: "Satellite ID", required: true },
      orbit: { type: "object", description: "Orbit: {altitude, inclination, raan}", required: true },
    },
    category: "space",
    execute: async (args) => {
      const cm = new ConstellationManagement()
      return cm.addSatellite(args.id, args.orbit)
    },
  },
  {
    id: "x_constellation_coverage",
    name: "Get Constellation Coverage",
    description: "Get global coverage percentage of the constellation.",
    parameters: {},
    category: "space",
    execute: async () => {
      const cm = new ConstellationManagement()
      return cm.getCoverage()
    },
  },
  {
    id: "x_constellation_revisit",
    name: "Get Revisit Time",
    description: "Get revisit time for a target point on Earth.",
    parameters: {
      targetPoint: { type: "object", description: "Target: {lat, lon}", required: true },
    },
    category: "space",
    execute: async (args) => {
      const cm = new ConstellationManagement()
      return cm.getRevisitTime(args.targetPoint)
    },
  },
  {
    id: "x_eclipse_predict",
    name: "Predict Eclipse",
    description: "Predict eclipse duration for a satellite orbit.",
    parameters: {
      satOrbit: { type: "object", description: "Satellite orbit: {altitude, inclination}", required: true },
      date: { type: "object", description: "Date for prediction", required: true },
    },
    category: "space",
    execute: async (args) => {
      const ep = new EclipsePrediction()
      return ep.predictEclipse(args.satOrbit, args.date)
    },
  },
  {
    id: "x_eclipse_power_budget",
    name: "Get Eclipse Power Budget",
    description: "Calculate power budget for eclipse period.",
    parameters: {
      solarPanelArea: { type: "number", description: "Solar panel area in m²", required: true },
      batteryCapacity: { type: "number", description: "Battery capacity in Wh", required: true },
    },
    category: "space",
    execute: async (args) => {
      const ep = new EclipsePrediction()
      return ep.getPowerBudget(args.solarPanelArea, args.batteryCapacity)
    },
  },
  {
    id: "x_thermal_monitor",
    name: "Monitor Thermal",
    description: "Record temperature at a spacecraft location.",
    parameters: {
      location: { type: "string", description: "Sensor location name", required: true },
      temp: { type: "number", description: "Temperature in Celsius", required: true },
    },
    category: "space",
    execute: async (args) => {
      const tp = new ThermalProtection()
      return tp.monitorTemp(args.location, args.temp)
    },
  },
  {
    id: "x_thermal_check_limits",
    name: "Check Thermal Limits",
    description: "Check all sensors against thermal limits.",
    parameters: {},
    category: "space",
    execute: async () => {
      const tp = new ThermalProtection()
      return tp.checkLimits()
    },
  },
  {
    id: "x_thermal_predict_flux",
    name: "Predict Heat Flux",
    description: "Predict heat flux during atmospheric re-entry.",
    parameters: {
      velocity: { type: "number", description: "Velocity in m/s", required: true },
      altitude: { type: "number", description: "Altitude in meters", required: true },
      angle: { type: "number", description: "Angle of attack in degrees", required: true },
    },
    category: "space",
    execute: async (args) => {
      const tp = new ThermalProtection()
      return tp.predictHeatFlux(args.velocity, args.altitude, args.angle)
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // HELICOPTER (18 tools)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "x_rotor_set_collective",
    name: "Set Rotor Collective",
    description: "Set the collective pitch of all rotor blades.",
    parameters: {
      pitch: { type: "number", description: "Collective pitch angle (-2 to 12)", required: true },
    },
    category: "helicopter",
    execute: async (args) => {
      const rc = new RotorController()
      return rc.setCollective(args.pitch)
    },
  },
  {
    id: "x_rotor_set_cyclic",
    name: "Set Rotor Cyclic",
    description: "Set the cyclic pitch and roll of the rotor system.",
    parameters: {
      pitch: { type: "number", description: "Cyclic pitch (-10 to 10)", required: true },
      roll: { type: "number", description: "Cyclic roll (-10 to 10)", required: true },
    },
    category: "helicopter",
    execute: async (args) => {
      const rc = new RotorController()
      return rc.setCyclic(args.pitch, args.roll)
    },
  },
  {
    id: "x_rotor_set_pedal",
    name: "Set Rotor Pedal",
    description: "Set anti-torque pedal position.",
    parameters: {
      antiTorque: { type: "number", description: "Pedal position (-100 to 100)", required: true },
    },
    category: "helicopter",
    execute: async (args) => {
      const rc = new RotorController()
      return rc.setPedal(args.antiTorque)
    },
  },
  {
    id: "x_rotor_get_rpm",
    name: "Get Rotor RPM",
    description: "Get current rotor RPM and status.",
    parameters: {},
    category: "helicopter",
    execute: async () => {
      const rc = new RotorController()
      return rc.getRotorRPM()
    },
  },
  {
    id: "x_rotor_health",
    name: "Check Rotor Health",
    description: "Check health of all rotor blades.",
    parameters: {},
    category: "helicopter",
    execute: async () => {
      const rc = new RotorController()
      return rc.checkHealth()
    },
  },
  {
    id: "x_hover_set_target",
    name: "Set Hover Target",
    description: "Set target hover position (lat, lon, alt).",
    parameters: {
      lat: { type: "number", description: "Target latitude", required: true },
      lon: { type: "number", description: "Target longitude", required: true },
      alt: { type: "number", description: "Target altitude in meters", required: true },
    },
    category: "helicopter",
    execute: async (args) => {
      const hc = new HoverController()
      return hc.setTargetPosition(args.lat, args.lon, args.alt)
    },
  },
  {
    id: "x_hover_get_error",
    name: "Get Hover Position Error",
    description: "Get position error from hover target.",
    parameters: {},
    category: "helicopter",
    execute: async () => {
      const hc = new HoverController()
      return hc.getPositionError()
    },
  },
  {
    id: "x_hover_correction",
    name: "Get Hover Correction",
    description: "Get correction commands to maintain hover.",
    parameters: {},
    category: "helicopter",
    execute: async () => {
      const hc = new HoverController()
      return hc.getCorrectionCommands()
    },
  },
  {
    id: "x_load_attach",
    name: "Attach External Load",
    description: "Attach an external load to the helicopter.",
    parameters: {
      id: { type: "string", description: "Load ID", required: true },
      weight: { type: "number", description: "Weight in kg (0-5000)", required: true },
      type: { type: "string", description: "Load type", required: true },
    },
    category: "helicopter",
    execute: async (args) => {
      const elc = new ExternalLoadController()
      return elc.attachLoad(args.id, args.weight, args.type)
    },
  },
  {
    id: "x_load_detach",
    name: "Detach External Load",
    description: "Detach an external load from the helicopter.",
    parameters: {
      id: { type: "string", description: "Load ID", required: true },
    },
    category: "helicopter",
    execute: async (args) => {
      const elc = new ExternalLoadController()
      return elc.detachLoad(args.id)
    },
  },
  {
    id: "x_load_compensate",
    name: "Compensate Load Swing",
    description: "Compensate for external load swing due to wind.",
    parameters: {
      id: { type: "string", description: "Load ID", required: true },
      wind: { type: "object", description: "Wind: {speed, direction}", required: true },
    },
    category: "helicopter",
    execute: async (args) => {
      const elc = new ExternalLoadController()
      return elc.compensateLoad(args.id, args.wind)
    },
  },
  {
    id: "x_auto_detect_power_loss",
    name: "Detect Power Loss",
    description: "Detect engine power loss for autorotation.",
    parameters: {},
    category: "helicopter",
    execute: async () => {
      const ars = new AutorotationSystem()
      return ars.detectPowerLoss()
    },
  },
  {
    id: "x_auto_initiate",
    name: "Initiate Autorotation",
    description: "Initiate autorotation after power loss.",
    parameters: {},
    category: "helicopter",
    execute: async () => {
      const ars = new AutorotationSystem()
      return ars.initiate()
    },
  },
  {
    id: "x_auto_maintain",
    name: "Maintain Autorotation",
    description: "Maintain autorotation at target rotor RPM.",
    parameters: {
      targetRPM: { type: "number", description: "Target rotor RPM", required: true },
    },
    category: "helicopter",
    execute: async (args) => {
      const ars = new AutorotationSystem()
      return ars.maintain(args.targetRPM)
    },
  },
  {
    id: "x_heli_weather_get_correction",
    name: "Get Weather Correction",
    description: "Get control corrections for wind compensation.",
    parameters: {
      heading: { type: "number", description: "Current heading in degrees", required: true },
      wind: { type: "object", description: "Wind: {speed, direction}", required: true },
    },
    category: "helicopter",
    execute: async (args) => {
      const hwc = new HelicopterWeatherCompensation()
      return hwc.getWindCorrection(args.heading, args.wind)
    },
  },
  {
    id: "x_heli_weather_get_crosswind",
    name: "Get Crosswind Component",
    description: "Get crosswind component relative to heading.",
    parameters: {
      wind: { type: "object", description: "Wind: {speed, direction}", required: true },
      heading: { type: "number", description: "Current heading in degrees", required: true },
    },
    category: "helicopter",
    execute: async (args) => {
      const hwc = new HelicopterWeatherCompensation()
      return hwc.getCrosswindComponent(args.wind, args.heading)
    },
  },
  {
    id: "x_vtol_plan_takeoff",
    name: "Plan VTOL Takeoff",
    description: "Plan vertical takeoff considering wind and weight.",
    parameters: {
      wind: { type: "object", description: "Wind: {speed, direction}", required: true },
      weight: { type: "number", description: "Aircraft weight in kg", required: true },
      altitude: { type: "number", description: "Target altitude in meters", required: true },
    },
    category: "helicopter",
    execute: async (args) => {
      const vtol = new VerticalTakeoffLanding()
      return vtol.planTakeoff(args.wind, args.weight, args.altitude)
    },
  },
  {
    id: "x_vtol_plan_landing",
    name: "Plan VTOL Landing",
    description: "Plan vertical landing considering surface type.",
    parameters: {
      wind: { type: "object", description: "Wind: {speed, direction}", required: true },
      weight: { type: "number", description: "Aircraft weight in kg", required: true },
      surfaceType: { type: "string", description: "Surface type (hard, soft, helipad)", required: true },
    },
    category: "helicopter",
    execute: async (args) => {
      const vtol = new VerticalTakeoffLanding()
      return vtol.planLanding(args.wind, args.weight, args.surfaceType)
    },
  },
  {
    id: "x_vtol_energy",
    name: "Get VTOL Energy",
    description: "Calculate energy requirements for VTOL operation.",
    parameters: {
      weight: { type: "number", description: "Aircraft weight in kg", required: true },
      altitude: { type: "number", description: "Altitude in meters", required: true },
    },
    category: "helicopter",
    execute: async (args) => {
      const vtol = new VerticalTakeoffLanding()
      return vtol.getVTOLEnergy(args.weight, args.altitude)
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDICAL (9 tools)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "x_medical_update_vitals",
    name: "Update Vital Signs",
    description: "Update a patient vital sign reading.",
    parameters: {
      vital: { type: "string", description: "Vital name (heartRate, bloodPressureSystolic, spO2, temperature, respiratoryRate)", required: true },
      value: { type: "number", description: "Vital value", required: true },
    },
    category: "medical",
    execute: async (args) => {
      const vsm = new VitalSignsMonitor()
      return vsm.updateReading(args.vital, args.value)
    },
  },
  {
    id: "x_medical_get_vitals",
    name: "Get All Vitals",
    description: "Get all current vital sign readings.",
    parameters: {},
    category: "medical",
    execute: async () => {
      const vsm = new VitalSignsMonitor()
      return vsm.getVitals()
    },
  },
  {
    id: "x_medical_check_alerts",
    name: "Check Vital Alerts",
    description: "Check for abnormal vital sign alerts.",
    parameters: {},
    category: "medical",
    execute: async () => {
      const vsm = new VitalSignsMonitor()
      return vsm.checkAlerts()
    },
  },
  {
    id: "x_drug_add_medication",
    name: "Add Medication",
    description: "Add a medication to the patient's list.",
    parameters: {
      name: { type: "string", description: "Medication name", required: true },
      dosage: { type: "string", description: "Dosage (e.g. 5mg)", required: true },
      frequency: { type: "string", description: "Frequency (e.g. twice daily)", required: true },
    },
    category: "medical",
    execute: async (args) => {
      const dic = new DrugInteractionChecker()
      return dic.addMedication(args.name, args.dosage, args.frequency)
    },
  },
  {
    id: "x_drug_check_interactions",
    name: "Check Drug Interactions",
    description: "Check for interactions between all medications.",
    parameters: {},
    category: "medical",
    execute: async () => {
      const dic = new DrugInteractionChecker()
      return dic.checkInteractions()
    },
  },
  {
    id: "x_drug_get_contraindications",
    name: "Get Contraindications",
    description: "Get contraindications for all current medications.",
    parameters: {},
    category: "medical",
    execute: async () => {
      const dic = new DrugInteractionChecker()
      return dic.getContraindications()
    },
  },
  {
    id: "x_patient_set",
    name: "Set Patient",
    description: "Register a new patient in the monitoring system.",
    parameters: {
      id: { type: "string", description: "Patient ID", required: true },
      name: { type: "string", description: "Patient name", required: true },
      age: { type: "number", description: "Patient age", required: true },
    },
    category: "medical",
    execute: async (args) => {
      const pm = new PatientMonitor()
      return pm.setPatient(args.id, args)
    },
  },
  {
    id: "x_patient_update_vitals",
    name: "Update Patient Vitals",
    description: "Update multiple vital signs for a patient.",
    parameters: {
      patientId: { type: "string", description: "Patient ID", required: true },
      vitals: { type: "object", description: "Vitals: {heartRate, spO2, temperature, ...}", required: true },
    },
    category: "medical",
    execute: async (args) => {
      const pm = new PatientMonitor()
      return pm.updateVitals(args.patientId, args.vitals)
    },
  },
  {
    id: "x_patient_get_alert_level",
    name: "Get Patient Alert Level",
    description: "Get patient alert level (green, yellow, orange, red).",
    parameters: {
      patientId: { type: "string", description: "Patient ID", required: true },
    },
    category: "medical",
    execute: async (args) => {
      const pm = new PatientMonitor()
      return pm.getAlertLevel(args.patientId)
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INDUSTRIAL (15 tools)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "x_plc_connect",
    name: "Connect PLC",
    description: "Connect to a PLC controller.",
    parameters: {
      plcId: { type: "string", description: "PLC identifier", required: true },
      ip: { type: "string", description: "PLC IP address", required: true },
    },
    category: "industrial",
    execute: async (args) => {
      const plc = new PLCController()
      return plc.connect(args.plcId, args.ip)
    },
  },
  {
    id: "x_plc_read_register",
    name: "Read PLC Register",
    description: "Read a value from a PLC register.",
    parameters: {
      plcId: { type: "string", description: "PLC identifier", required: true },
      address: { type: "number", description: "Register address (0-65535)", required: true },
    },
    category: "industrial",
    execute: async (args) => {
      const plc = new PLCController()
      return plc.readRegister(args.plcId, args.address)
    },
  },
  {
    id: "x_plc_write_register",
    name: "Write PLC Register",
    description: "Write a value to a PLC register.",
    parameters: {
      plcId: { type: "string", description: "PLC identifier", required: true },
      address: { type: "number", description: "Register address (0-65535)", required: true },
      value: { type: "number", description: "Value to write", required: true },
    },
    category: "industrial",
    execute: async (args) => {
      const plc = new PLCController()
      return plc.writeRegister(args.plcId, args.address, args.value)
    },
  },
  {
    id: "x_scada_add_sensor",
    name: "Add SCADA Sensor",
    description: "Add a sensor to SCADA monitoring system.",
    parameters: {
      id: { type: "string", description: "Sensor ID", required: true },
      type: { type: "string", description: "Sensor type", required: true },
      location: { type: "string", description: "Sensor location", required: true },
    },
    category: "industrial",
    execute: async (args) => {
      const scada = new SCADAMonitor()
      return scada.addSensor(args.id, args.type, args.location)
    },
  },
  {
    id: "x_scada_update_value",
    name: "Update SCADA Sensor Value",
    description: "Update a SCADA sensor reading.",
    parameters: {
      sensorId: { type: "string", description: "Sensor ID", required: true },
      value: { type: "number", description: "Sensor value", required: true },
    },
    category: "industrial",
    execute: async (args) => {
      const scada = new SCADAMonitor()
      return scada.updateValue(args.sensorId, args.value)
    },
  },
  {
    id: "x_scada_check_limits",
    name: "Check SCADA Limits",
    description: "Check sensor against normal and critical limits.",
    parameters: {
      sensorId: { type: "string", description: "Sensor ID", required: true },
    },
    category: "industrial",
    execute: async (args) => {
      const scada = new SCADAMonitor()
      return scada.checkLimits(args.sensorId)
    },
  },
  {
    id: "x_cnc_load_program",
    name: "Load CNC Program",
    description: "Load a G-code program into the CNC controller.",
    parameters: {
      gcode: { type: "string", description: "G-code program text", required: true },
    },
    category: "industrial",
    execute: async (args) => {
      const cnc = new CNCController()
      return cnc.loadProgram(args.gcode)
    },
  },
  {
    id: "x_cnc_start",
    name: "Start CNC",
    description: "Start CNC program execution.",
    parameters: {},
    category: "industrial",
    execute: async () => {
      const cnc = new CNCController()
      return cnc.start()
    },
  },
  {
    id: "x_cnc_stop",
    name: "Stop CNC",
    description: "Stop CNC program execution.",
    parameters: {},
    category: "industrial",
    execute: async () => {
      const cnc = new CNCController()
      return cnc.stop()
    },
  },
  {
    id: "x_cnc_get_status",
    name: "Get CNC Status",
    description: "Get CNC controller status and position.",
    parameters: {},
    category: "industrial",
    execute: async () => {
      const cnc = new CNCController()
      return cnc.getStatus()
    },
  },
  {
    id: "x_robot_set_joint",
    name: "Set Robot Joint",
    description: "Set a specific joint angle on the robotic arm.",
    parameters: {
      axis: { type: "number", description: "Joint axis (1-6)", required: true },
      angle: { type: "number", description: "Angle in degrees (-180 to 180)", required: true },
    },
    category: "industrial",
    execute: async (args) => {
      const ra = new RoboticArmController()
      return ra.setJoint(args.axis, args.angle)
    },
  },
  {
    id: "x_robot_move_linear",
    name: "Move Robot Linear",
    description: "Move the robotic arm end effector linearly.",
    parameters: {
      x: { type: "number", description: "Target X position", required: true },
      y: { type: "number", description: "Target Y position", required: true },
      z: { type: "number", description: "Target Z position", required: true },
    },
    category: "industrial",
    execute: async (args) => {
      const ra = new RoboticArmController()
      return ra.moveLinear(args.x, args.y, args.z)
    },
  },
  {
    id: "x_robot_get_kinematics",
    name: "Get Robot Kinematics",
    description: "Calculate forward kinematics for current joint angles.",
    parameters: {},
    category: "industrial",
    execute: async () => {
      const ra = new RoboticArmController()
      return ra.getKinematics()
    },
  },
  {
    id: "x_conveyor_start",
    name: "Start Conveyor",
    description: "Start the conveyor belt.",
    parameters: {},
    category: "industrial",
    execute: async () => {
      const cc = new ConveyorController()
      return cc.start()
    },
  },
  {
    id: "x_conveyor_stop",
    name: "Stop Conveyor",
    description: "Stop the conveyor belt.",
    parameters: {},
    category: "industrial",
    execute: async () => {
      const cc = new ConveyorController()
      return cc.stop()
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INFRASTRUCTURE (15 tools)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "x_power_add_generator",
    name: "Add Power Generator",
    description: "Add a generator to the power grid.",
    parameters: {
      id: { type: "string", description: "Generator ID", required: true },
      type: { type: "string", description: "Generator type (solar, wind, diesel, gas)", required: true },
      capacity: { type: "number", description: "Capacity in kW", required: true },
    },
    category: "infrastructure",
    execute: async (args) => {
      const pgc = new PowerGridController()
      return pgc.addGenerator(args.id, args.type, args.capacity)
    },
  },
  {
    id: "x_power_add_load",
    name: "Add Power Load",
    description: "Add a load to the power grid.",
    parameters: {
      id: { type: "string", description: "Load ID", required: true },
      power: { type: "number", description: "Power demand in kW", required: true },
    },
    category: "infrastructure",
    execute: async (args) => {
      const pgc = new PowerGridController()
      return pgc.addLoad(args.id, args.power)
    },
  },
  {
    id: "x_power_get_balance",
    name: "Get Power Balance",
    description: "Get generation vs load balance.",
    parameters: {},
    category: "infrastructure",
    execute: async () => {
      const pgc = new PowerGridController()
      return pgc.getBalance()
    },
  },
  {
    id: "x_water_set_flow",
    name: "Set Water Flow Rate",
    description: "Set the water treatment flow rate.",
    parameters: {
      rate: { type: "number", description: "Flow rate (0-1000)", required: true },
    },
    category: "infrastructure",
    execute: async (args) => {
      const wts = new WaterTreatmentSystem()
      return wts.setFlowRate(args.rate)
    },
  },
  {
    id: "x_water_set_ph",
    name: "Set Water pH",
    description: "Set the water treatment pH level.",
    parameters: {
      level: { type: "number", description: "pH level (0-14)", required: true },
    },
    category: "infrastructure",
    execute: async (args) => {
      const wts = new WaterTreatmentSystem()
      return wts.setPH(args.level)
    },
  },
  {
    id: "x_water_get_quality",
    name: "Get Water Quality",
    description: "Get overall water treatment quality score.",
    parameters: {},
    category: "infrastructure",
    execute: async () => {
      const wts = new WaterTreatmentSystem()
      return wts.getQuality()
    },
  },
  {
    id: "x_hvac_set_temp",
    name: "Set HVAC Temperature",
    description: "Set target temperature for an HVAC zone.",
    parameters: {
      zoneId: { type: "string", description: "Zone ID", required: true },
      temp: { type: "number", description: "Target temperature in Celsius", required: true },
    },
    category: "infrastructure",
    execute: async (args) => {
      const hvac = new HVACController()
      return hvac.setTemp(args.zoneId, args.temp)
    },
  },
  {
    id: "x_hvac_set_humidity",
    name: "Set HVAC Humidity",
    description: "Set target humidity for an HVAC zone.",
    parameters: {
      zoneId: { type: "string", description: "Zone ID", required: true },
      humidity: { type: "number", description: "Target humidity (0-100%)", required: true },
    },
    category: "infrastructure",
    execute: async (args) => {
      const hvac = new HVACController()
      return hvac.setHumidity(args.zoneId, args.humidity)
    },
  },
  {
    id: "x_hvac_get_efficiency",
    name: "Get HVAC Efficiency",
    description: "Get overall HVAC system efficiency.",
    parameters: {},
    category: "infrastructure",
    execute: async () => {
      const hvac = new HVACController()
      return hvac.getEfficiency()
    },
  },
  {
    id: "x_fire_detect_smoke",
    name: "Detect Smoke",
    description: "Report smoke detection in a zone.",
    parameters: {
      zone: { type: "string", description: "Zone ID", required: true },
    },
    category: "infrastructure",
    execute: async (args) => {
      const fss = new FireSuppressionSystem()
      return fss.detectSmoke(args.zone)
    },
  },
  {
    id: "x_fire_detect_heat",
    name: "Detect Heat",
    description: "Report heat detection in a zone.",
    parameters: {
      zone: { type: "string", description: "Zone ID", required: true },
      temp: { type: "number", description: "Detected temperature in Celsius", required: true },
    },
    category: "infrastructure",
    execute: async (args) => {
      const fss = new FireSuppressionSystem()
      return fss.detectHeat(args.zone, args.temp)
    },
  },
  {
    id: "x_fire_activate",
    name: "Activate Fire Suppression",
    description: "Activate fire suppressant in a zone.",
    parameters: {
      zone: { type: "string", description: "Zone ID", required: true },
    },
    category: "infrastructure",
    execute: async (args) => {
      const fss = new FireSuppressionSystem()
      return fss.activateSuppressant(args.zone)
    },
  },
  {
    id: "x_rail_set_signal",
    name: "Set Railway Signal",
    description: "Set railway signal state for a section.",
    parameters: {
      section: { type: "string", description: "Track section ID", required: true },
      state: { type: "string", description: "Signal state (red, yellow, green)", required: true },
    },
    category: "infrastructure",
    execute: async (args) => {
      const rc = new RailwayController()
      return rc.setSignal(args.section, args.state)
    },
  },
  {
    id: "x_rail_set_speed",
    name: "Set Train Speed",
    description: "Set allowed speed for a train.",
    parameters: {
      trainId: { type: "string", description: "Train ID", required: true },
      speed: { type: "number", description: "Speed in km/h (0-300)", required: true },
    },
    category: "infrastructure",
    execute: async (args) => {
      const rc = new RailwayController()
      return rc.setSpeed(args.trainId, args.speed)
    },
  },
  {
    id: "x_rail_emergency_stop",
    name: "Railway Emergency Stop",
    description: "Emergency stop a train.",
    parameters: {
      trainId: { type: "string", description: "Train ID", required: true },
    },
    category: "infrastructure",
    execute: async (args) => {
      const rc = new RailwayController()
      return rc.emergencyStop(args.trainId)
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECURITY (15 tools)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "x_surveillance_add_camera",
    name: "Add Surveillance Camera",
    description: "Add a camera to the surveillance system.",
    parameters: {
      id: { type: "string", description: "Camera ID", required: true },
      location: { type: "string", description: "Camera location", required: true },
    },
    category: "security",
    execute: async (args) => {
      const ss = new SurveillanceSystem()
      return ss.addCamera(args.id, args.location)
    },
  },
  {
    id: "x_surveillance_detect_motion",
    name: "Detect Motion",
    description: "Check for motion on a surveillance camera.",
    parameters: {
      cameraId: { type: "string", description: "Camera ID", required: true },
    },
    category: "security",
    execute: async (args) => {
      const ss = new SurveillanceSystem()
      return ss.detectMotion(args.cameraId)
    },
  },
  {
    id: "x_surveillance_set_recording",
    name: "Set Recording",
    description: "Enable or disable recording on a camera.",
    parameters: {
      cameraId: { type: "string", description: "Camera ID", required: true },
      on: { type: "boolean", description: "Recording on/off", required: true },
    },
    category: "security",
    execute: async (args) => {
      const ss = new SurveillanceSystem()
      return ss.setRecording(args.cameraId, args.on)
    },
  },
  {
    id: "x_access_grant",
    name: "Grant Access",
    description: "Grant access to a person for an entry point.",
    parameters: {
      personId: { type: "string", description: "Person ID", required: true },
      entryId: { type: "string", description: "Entry point ID", required: true },
      duration: { type: "number", description: "Access duration in milliseconds", required: true },
    },
    category: "security",
    execute: async (args) => {
      const acs = new AccessControlSystem()
      return acs.grantAccess(args.personId, args.entryId, args.duration)
    },
  },
  {
    id: "x_access_revoke",
    name: "Revoke Access",
    description: "Revoke a person's access to an entry point.",
    parameters: {
      personId: { type: "string", description: "Person ID", required: true },
      entryId: { type: "string", description: "Entry point ID", required: true },
    },
    category: "security",
    execute: async (args) => {
      const acs = new AccessControlSystem()
      return acs.revokeAccess(args.personId, args.entryId)
    },
  },
  {
    id: "x_access_check",
    name: "Check Access",
    description: "Check if a person has access to an entry point.",
    parameters: {
      personId: { type: "string", description: "Person ID", required: true },
      entryId: { type: "string", description: "Entry point ID", required: true },
    },
    category: "security",
    execute: async (args) => {
      const acs = new AccessControlSystem()
      return acs.checkAccess(args.personId, args.entryId)
    },
  },
  {
    id: "x_intrusion_set_zone",
    name: "Set Intrusion Zone",
    description: "Configure an intrusion detection zone.",
    parameters: {
      id: { type: "string", description: "Zone ID", required: true },
      type: { type: "string", description: "Zone type (perimeter, interior, motion)", required: true },
      coordinates: { type: "array", description: "Zone boundary coordinates", required: true },
    },
    category: "security",
    execute: async (args) => {
      const id = new IntrusionDetector()
      return id.setZone(args.id, args.type, args.coordinates)
    },
  },
  {
    id: "x_intrusion_arm",
    name: "Arm Intrusion Zone",
    description: "Arm an intrusion detection zone.",
    parameters: {
      id: { type: "string", description: "Zone ID", required: true },
    },
    category: "security",
    execute: async (args) => {
      const id = new IntrusionDetector()
      return id.armZone(args.id)
    },
  },
  {
    id: "x_intrusion_check_breach",
    name: "Check Intrusion Breach",
    description: "Check for breach in an intrusion zone.",
    parameters: {
      zoneId: { type: "string", description: "Zone ID", required: true },
      sensorData: { type: "number", description: "Sensor reading (0-100)", required: true },
    },
    category: "security",
    execute: async (args) => {
      const id = new IntrusionDetector()
      return id.checkBreach(args.zoneId, args.sensorData)
    },
  },
  {
    id: "x_cyber_detect_port_scan",
    name: "Detect Port Scan",
    description: "Detect port scanning activity on a host.",
    parameters: {
      hostId: { type: "string", description: "Host ID", required: true },
    },
    category: "security",
    execute: async (args) => {
      const csm = new CyberSecurityMonitor()
      return csm.detectPortScan(args.hostId)
    },
  },
  {
    id: "x_cyber_detect_brute_force",
    name: "Detect Brute Force",
    description: "Detect brute force attack on a host.",
    parameters: {
      hostId: { type: "string", description: "Host ID", required: true },
    },
    category: "security",
    execute: async (args) => {
      const csm = new CyberSecurityMonitor()
      return csm.detectBruteForce(args.hostId)
    },
  },
  {
    id: "x_cyber_block_ip",
    name: "Block IP Address",
    description: "Block a malicious IP address in the firewall.",
    parameters: {
      ip: { type: "string", description: "IP address to block", required: true },
    },
    category: "security",
    execute: async (args) => {
      const csm = new CyberSecurityMonitor()
      return csm.blockIP(args.ip)
    },
  },
  {
    id: "x_encrypt_data",
    name: "Encrypt Data",
    description: "Encrypt data using AES encryption.",
    parameters: {
      data: { type: "string", description: "Plaintext data to encrypt", required: true },
      algorithm: { type: "string", description: "Algorithm (AES-GCM, AES-CBC)", required: true },
    },
    category: "security",
    execute: async (args) => {
      const ee = new EncryptionEngine()
      return ee.encrypt(args.data, args.algorithm)
    },
  },
  {
    id: "x_decrypt_data",
    name: "Decrypt Data",
    description: "Decrypt data using AES decryption.",
    parameters: {
      ciphertext: { type: "array", description: "Ciphertext as number array", required: true },
      key: { type: "array", description: "Decryption key as number array", required: true },
      algorithm: { type: "string", description: "Algorithm (AES-GCM, AES-CBC)", required: true },
    },
    category: "security",
    execute: async (args) => {
      const ee = new EncryptionEngine()
      return ee.decrypt(args.ciphertext, args.key, args.algorithm)
    },
  },
  {
    id: "x_encrypt_hash",
    name: "Hash Data",
    description: "Generate a cryptographic hash of data.",
    parameters: {
      data: { type: "string", description: "Data to hash", required: true },
      algorithm: { type: "string", description: "Hash algorithm (SHA-256, SHA-384, SHA-512)", required: false },
    },
    category: "security",
    execute: async (args) => {
      const ee = new EncryptionEngine()
      return ee.hash(args.data, args.algorithm)
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SURVEY (15 tools)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "x_lidar_add_point",
    name: "Add LiDAR Point",
    description: "Add a point to the LiDAR point cloud.",
    parameters: {
      x: { type: "number", description: "X coordinate", required: true },
      y: { type: "number", description: "Y coordinate", required: true },
      z: { type: "number", description: "Z coordinate (elevation)", required: true },
      intensity: { type: "number", description: "Return intensity", required: true },
    },
    category: "survey",
    execute: async (args) => {
      const lidar = new LiDARScanner()
      return lidar.addPoint(args.x, args.y, args.z, args.intensity)
    },
  },
  {
    id: "x_lidar_downsample",
    name: "Downsample LiDAR",
    description: "Downsample point cloud using voxel grid.",
    parameters: {
      gridSize: { type: "number", description: "Voxel grid size", required: true },
    },
    category: "survey",
    execute: async (args) => {
      const lidar = new LiDARScanner()
      return lidar.downsample(args.gridSize)
    },
  },
  {
    id: "x_lidar_get_volume",
    name: "Get LiDAR Volume",
    description: "Calculate volume within a boundary from point cloud.",
    parameters: {
      boundary: { type: "object", description: "Boundary: {xMin, xMax, yMin, yMax}", required: true },
    },
    category: "survey",
    execute: async (args) => {
      const lidar = new LiDARScanner()
      return lidar.getVolume(args.boundary)
    },
  },
  {
    id: "x_rtk_set_position",
    name: "Set RTK Position",
    description: "Set GPS RTK position.",
    parameters: {
      lat: { type: "number", description: "Latitude", required: true },
      lon: { type: "number", description: "Longitude", required: true },
      alt: { type: "number", description: "Altitude in meters", required: true },
    },
    category: "survey",
    execute: async (args) => {
      const rtk = new GPSRTK()
      return rtk.setPosition(args.lat, args.lon, args.alt)
    },
  },
  {
    id: "x_rtk_get_accuracy",
    name: "Get RTK Accuracy",
    description: "Get current RTK position accuracy.",
    parameters: {},
    category: "survey",
    execute: async () => {
      const rtk = new GPSRTK()
      return rtk.getAccuracy()
    },
  },
  {
    id: "x_rtk_get_fix",
    name: "Get RTK Fix Quality",
    description: "Get RTK fix quality (none, single, float, fixed).",
    parameters: {},
    category: "survey",
    execute: async () => {
      const rtk = new GPSRTK()
      return rtk.getFixQuality()
    },
  },
  {
    id: "x_total_station_measure_distance",
    name: "Measure Distance",
    description: "Measure distance with total station.",
    parameters: {},
    category: "survey",
    execute: async () => {
      const ts = new TotalStation()
      return ts.measureDistance()
    },
  },
  {
    id: "x_total_station_measure_angle",
    name: "Measure Angle",
    description: "Measure angle with total station.",
    parameters: {},
    category: "survey",
    execute: async () => {
      const ts = new TotalStation()
      return ts.measureAngle()
    },
  },
  {
    id: "x_mapper_set_flight",
    name: "Set Drone Mapper Flight",
    description: "Set photogrammetry flight plan.",
    parameters: {
      waypoints: { type: "array", description: "Waypoints [{lat, lon}]", required: true },
      altitude: { type: "number", description: "Flight altitude in meters", required: true },
      overlap: { type: "number", description: "Photo overlap percentage", required: true },
    },
    category: "survey",
    execute: async (args) => {
      const dm = new DroneMapper()
      return dm.setFlightPlan(args.waypoints, args.altitude, args.overlap)
    },
  },
  {
    id: "x_mapper_add_photo",
    name: "Add Mapper Photo",
    description: "Add a photo to the drone mapper dataset.",
    parameters: {
      path: { type: "string", description: "Photo file path", required: true },
      lat: { type: "number", description: "Latitude", required: true },
      lon: { type: "number", description: "Longitude", required: true },
      alt: { type: "number", description: "Altitude", required: true },
      roll: { type: "number", description: "Roll angle", required: true },
      pitch: { type: "number", description: "Pitch angle", required: true },
      yaw: { type: "number", description: "Yaw angle", required: true },
    },
    category: "survey",
    execute: async (args) => {
      const dm = new DroneMapper()
      return dm.addPhoto(args.path, args.lat, args.lon, args.alt, args.roll, args.pitch, args.yaw)
    },
  },
  {
    id: "x_mapper_generate_model",
    name: "Generate 3D Model",
    description: "Generate 3D model from drone mapper photos.",
    parameters: {},
    category: "survey",
    execute: async () => {
      const dm = new DroneMapper()
      return dm.get3DModel()
    },
  },
  {
    id: "x_seismic_add_sensor",
    name: "Add Seismic Sensor",
    description: "Add a seismic monitoring sensor.",
    parameters: {
      id: { type: "string", description: "Sensor ID", required: true },
      location: { type: "object", description: "Location: {lat, lon}", required: true },
    },
    category: "survey",
    execute: async (args) => {
      const sm = new SeismicMonitor()
      return sm.addSensor(args.id, args.location)
    },
  },
  {
    id: "x_seismic_detect_pwave",
    name: "Detect P-Wave",
    description: "Record P-wave detection from a sensor.",
    parameters: {
      sensorId: { type: "string", description: "Sensor ID", required: true },
      amplitude: { type: "number", description: "Wave amplitude", required: true },
    },
    category: "survey",
    execute: async (args) => {
      const sm = new SeismicMonitor()
      return sm.detectPWave(args.sensorId, args.amplitude)
    },
  },
  {
    id: "x_seismic_get_magnitude",
    name: "Get Seismic Magnitude",
    description: "Calculate earthquake magnitude from detections.",
    parameters: {},
    category: "survey",
    execute: async () => {
      const sm = new SeismicMonitor()
      return sm.getMagnitude()
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AGRICULTURE (15 tools)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "x_soil_add_sample",
    name: "Add Soil Sample",
    description: "Add a soil sample for analysis.",
    parameters: {
      id: { type: "string", description: "Sample ID", required: true },
      location: { type: "object", description: "Location: {lat, lon}", required: true },
      ph: { type: "number", description: "Soil pH", required: true },
      moisture: { type: "number", description: "Moisture percentage (0-100)", required: true },
      nitrogen: { type: "number", description: "Nitrogen level (ppm)", required: true },
      phosphorus: { type: "number", description: "Phosphorus level (ppm)", required: true },
      potassium: { type: "number", description: "Potassium level (ppm)", required: true },
    },
    category: "agriculture",
    execute: async (args) => {
      const sa = new SoilAnalyzer()
      return sa.addSample(args.id, args.location, args.ph, args.moisture, args.nitrogen, args.phosphorus, args.potassium)
    },
  },
  {
    id: "x_soil_get_recommendation",
    name: "Get Soil Recommendation",
    description: "Get fertilizer and treatment recommendations for a soil sample.",
    parameters: {
      sampleId: { type: "string", description: "Soil sample ID", required: true },
    },
    category: "agriculture",
    execute: async (args) => {
      const sa = new SoilAnalyzer()
      return sa.getRecommendation(args.sampleId)
    },
  },
  {
    id: "x_soil_get_heatmap",
    name: "Get Soil Heatmap",
    description: "Get soil health heatmap across all samples.",
    parameters: {},
    category: "agriculture",
    execute: async () => {
      const sa = new SoilAnalyzer()
      return sa.getHeatmap()
    },
  },
  {
    id: "x_crop_add_field",
    name: "Add Crop Field",
    description: "Add a field for crop monitoring.",
    parameters: {
      id: { type: "string", description: "Field ID", required: true },
      crop: { type: "string", description: "Crop type (rice, wheat, corn, cotton, sugarcane)", required: true },
      area: { type: "number", description: "Field area in hectares", required: true },
    },
    category: "agriculture",
    execute: async (args) => {
      const cm = new CropMonitor()
      return cm.addField(args.id, args.crop, args.area)
    },
  },
  {
    id: "x_crop_update_growth",
    name: "Update Crop Growth",
    description: "Update growth stage and health for a field.",
    parameters: {
      fieldId: { type: "string", description: "Field ID", required: true },
      stage: { type: "string", description: "Growth stage (seedling, vegetative, flowering, fruiting, mature)", required: true },
      health: { type: "number", description: "Health score (0-100)", required: true },
    },
    category: "agriculture",
    execute: async (args) => {
      const cm = new CropMonitor()
      return cm.updateGrowth(args.fieldId, args.stage, args.health)
    },
  },
  {
    id: "x_crop_predict_yield",
    name: "Predict Crop Yield",
    description: "Predict harvest yield for a field.",
    parameters: {
      fieldId: { type: "string", description: "Field ID", required: true },
    },
    category: "agriculture",
    execute: async (args) => {
      const cm = new CropMonitor()
      return cm.predictYield(args.fieldId)
    },
  },
  {
    id: "x_irrigation_set_zone",
    name: "Set Irrigation Zone",
    description: "Set up an irrigation zone.",
    parameters: {
      id: { type: "string", description: "Zone ID", required: true },
      area: { type: "number", description: "Zone area in hectares", required: true },
      crop: { type: "string", description: "Crop type", required: true },
    },
    category: "agriculture",
    execute: async (args) => {
      const ic = new IrrigationController()
      return ic.setZone(args.id, args.area, args.crop)
    },
  },
  {
    id: "x_irrigation_start",
    name: "Start Irrigation",
    description: "Start irrigation for a zone.",
    parameters: {
      zoneId: { type: "string", description: "Zone ID", required: true },
    },
    category: "agriculture",
    execute: async (args) => {
      const ic = new IrrigationController()
      return ic.startZone(args.zoneId)
    },
  },
  {
    id: "x_irrigation_get_usage",
    name: "Get Water Usage",
    description: "Get total water usage across all irrigation zones.",
    parameters: {},
    category: "agriculture",
    execute: async () => {
      const ic = new IrrigationController()
      return ic.getWaterUsage()
    },
  },
  {
    id: "x_pest_add_observation",
    name: "Add Pest Observation",
    description: "Record a pest observation in a field.",
    parameters: {
      fieldId: { type: "string", description: "Field ID", required: true },
      pestType: { type: "string", description: "Pest type", required: true },
      severity: { type: "number", description: "Severity (0-10)", required: true },
      location: { type: "object", description: "Location: {lat, lon}", required: true },
    },
    category: "agriculture",
    execute: async (args) => {
      const pd = new PestDetector()
      return pd.addObservation(args.fieldId, args.pestType, args.severity, args.location)
    },
  },
  {
    id: "x_pest_get_risk",
    name: "Get Pest Risk",
    description: "Get pest risk level for a field.",
    parameters: {
      fieldId: { type: "string", description: "Field ID", required: true },
    },
    category: "agriculture",
    execute: async (args) => {
      const pd = new PestDetector()
      return pd.getRisk(args.fieldId)
    },
  },
  {
    id: "x_pest_get_recommendation",
    name: "Get Pest Recommendation",
    description: "Get pest treatment recommendations for a field.",
    parameters: {
      fieldId: { type: "string", description: "Field ID", required: true },
    },
    category: "agriculture",
    execute: async (args) => {
      const pd = new PestDetector()
      return pd.getRecommendation(args.fieldId)
    },
  },
  {
    id: "x_harvest_set_field",
    name: "Set Harvest Field",
    description: "Set field data for harvest planning.",
    parameters: {
      id: { type: "string", description: "Field ID", required: true },
      crop: { type: "string", description: "Crop type", required: true },
      area: { type: "number", description: "Area in hectares", required: true },
      expectedYield: { type: "number", description: "Expected yield in tons", required: true },
      maturityDate: { type: "string", description: "Expected maturity date", required: true },
    },
    category: "agriculture",
    execute: async (args) => {
      const hp = new HarvestPlanner()
      return hp.setField(args.id, args.crop, args.area, args.expectedYield, args.maturityDate)
    },
  },
  {
    id: "x_harvest_plan_schedule",
    name: "Plan Harvest Schedule",
    description: "Create a prioritized harvest schedule.",
    parameters: {
      fields: { type: "array", description: "Fields: [{fieldId, priority}]", required: true },
    },
    category: "agriculture",
    execute: async (args) => {
      const hp = new HarvestPlanner()
      return hp.planSchedule(args.fields)
    },
  },
  {
    id: "x_harvest_get_optimal_date",
    name: "Get Optimal Harvest Date",
    description: "Get optimal harvest date for a field.",
    parameters: {
      fieldId: { type: "string", description: "Field ID", required: true },
    },
    category: "agriculture",
    execute: async (args) => {
      const hp = new HarvestPlanner()
      return hp.getOptimalDate(args.fieldId)
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MARINE (15 tools)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "x_sonar_add_target",
    name: "Add Sonar Target",
    description: "Add a sonar contact/target.",
    parameters: {
      id: { type: "string", description: "Target ID", required: true },
      range: { type: "number", description: "Range in meters", required: true },
      bearing: { type: "number", description: "Bearing in degrees", required: true },
      depth: { type: "number", description: "Depth in meters", required: true },
    },
    category: "marine",
    execute: async (args) => {
      const sonar = new SonarSystem()
      return sonar.addTarget(args.id, args.range, args.bearing, args.depth)
    },
  },
  {
    id: "x_sonar_get_targets",
    name: "Get Sonar Targets",
    description: "Get all detected sonar targets.",
    parameters: {},
    category: "marine",
    execute: async () => {
      const sonar = new SonarSystem()
      return sonar.getTargets()
    },
  },
  {
    id: "x_sonar_classify",
    name: "Classify Sonar Target",
    description: "Classify a sonar contact type.",
    parameters: {
      id: { type: "string", description: "Target ID", required: true },
    },
    category: "marine",
    execute: async (args) => {
      const sonar = new SonarSystem()
      return sonar.classifyTarget(args.id)
    },
  },
  {
    id: "x_nav_chart_add_waypoint",
    name: "Add Navigation Waypoint",
    description: "Add a waypoint to the navigation chart.",
    parameters: {
      id: { type: "string", description: "Waypoint ID", required: true },
      lat: { type: "number", description: "Latitude", required: true },
      lon: { type: "number", description: "Longitude", required: true },
      name: { type: "string", description: "Waypoint name", required: true },
    },
    category: "marine",
    execute: async (args) => {
      const nc = new NavigationChart()
      return nc.addWaypoint(args.id, args.lat, args.lon, args.name)
    },
  },
  {
    id: "x_nav_chart_set_route",
    name: "Set Navigation Route",
    description: "Set a route through waypoints.",
    parameters: {
      waypoints: { type: "array", description: "Waypoint IDs in order", required: true },
    },
    category: "marine",
    execute: async (args) => {
      const nc = new NavigationChart()
      return nc.setRoute(args.waypoints)
    },
  },
  {
    id: "x_nav_chart_get_eta",
    name: "Get Navigation ETA",
    description: "Get estimated time of arrival to next waypoint.",
    parameters: {},
    category: "marine",
    execute: async () => {
      const nc = new NavigationChart()
      return nc.getETA()
    },
  },
  {
    id: "x_hull_add_sensor",
    name: "Add Hull Sensor",
    description: "Add a pressure sensor to the hull monitor.",
    parameters: {
      id: { type: "string", description: "Sensor ID", required: true },
      location: { type: "string", description: "Sensor location on hull", required: true },
    },
    category: "marine",
    execute: async (args) => {
      const hm = new HullMonitor()
      return hm.addSensor(args.id, args.location)
    },
  },
  {
    id: "x_hull_check_integrity",
    name: "Check Hull Integrity",
    description: "Check hull structural integrity.",
    parameters: {},
    category: "marine",
    execute: async () => {
      const hm = new HullMonitor()
      return hm.checkStructuralIntegrity()
    },
  },
  {
    id: "x_hull_detect_leak",
    name: "Detect Hull Leak",
    description: "Check for water ingress at a sensor.",
    parameters: {
      sensorId: { type: "string", description: "Sensor ID", required: true },
    },
    category: "marine",
    execute: async (args) => {
      const hm = new HullMonitor()
      return hm.detectLeak(args.sensorId)
    },
  },
  {
    id: "x_anchor_calculate_scope",
    name: "Calculate Anchor Scope",
    description: "Calculate required anchor scope for depth and wind.",
    parameters: {
      depth: { type: "number", description: "Water depth in meters", required: true },
      wind: { type: "number", description: "Wind speed in knots", required: true },
    },
    category: "marine",
    execute: async (args) => {
      const anchor = new AnchorSystem()
      return anchor.calculateScope(args.depth, args.wind)
    },
  },
  {
    id: "x_anchor_drop",
    name: "Drop Anchor",
    description: "Deploy the anchor.",
    parameters: {
      anchorType: { type: "string", description: "Anchor type (plow, fluke, mushroom, claw)", required: true },
      scope: { type: "number", description: "Scope in meters", required: true },
    },
    category: "marine",
    execute: async (args) => {
      const anchor = new AnchorSystem()
      return anchor.drop(args.anchorType, args.scope)
    },
  },
  {
    id: "x_anchor_retrieve",
    name: "Retrieve Anchor",
    description: "Retrieve the deployed anchor.",
    parameters: {},
    category: "marine",
    execute: async () => {
      const anchor = new AnchorSystem()
      return anchor.retrieve()
    },
  },
  {
    id: "x_ballast_add_tank",
    name: "Add Ballast Tank",
    description: "Add a ballast tank to the system.",
    parameters: {
      id: { type: "string", description: "Tank ID", required: true },
      capacity: { type: "number", description: "Tank capacity in m³", required: true },
    },
    category: "marine",
    execute: async (args) => {
      const bc = new BallastController()
      return bc.addTank(args.id, args.capacity)
    },
  },
  {
    id: "x_ballast_fill",
    name: "Fill Ballast Tank",
    description: "Fill a ballast tank with water.",
    parameters: {
      id: { type: "string", description: "Tank ID", required: true },
      amount: { type: "number", description: "Amount in m³", required: true },
    },
    category: "marine",
    execute: async (args) => {
      const bc = new BallastController()
      return bc.fillTank(args.id, args.amount)
    },
  },
  {
    id: "x_ballast_get_stability",
    name: "Get Ballast Stability",
    description: "Get vessel stability assessment from ballast state.",
    parameters: {},
    category: "marine",
    execute: async () => {
      const bc = new BallastController()
      return bc.getStability()
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSTRUCTION (15 tools)
  // ═══════════════════════════════════════════════════════════════════════════

  {
    id: "x_excavator_set_arm",
    name: "Set Excavator Arm",
    description: "Set excavator arm angle.",
    parameters: {
      angle: { type: "number", description: "Arm angle (0-180)", required: true },
    },
    category: "construction",
    execute: async (args) => {
      const ec = new ExcavatorController()
      return ec.setArm(args.angle)
    },
  },
  {
    id: "x_excavator_set_bucket",
    name: "Set Excavator Bucket",
    description: "Set excavator bucket angle.",
    parameters: {
      angle: { type: "number", description: "Bucket angle (-90 to 45)", required: true },
    },
    category: "construction",
    execute: async (args) => {
      const ec = new ExcavatorController()
      return ec.setBucket(args.angle)
    },
  },
  {
    id: "x_excavator_dig",
    name: "Excavator Dig",
    description: "Execute a digging operation.",
    parameters: {},
    category: "construction",
    execute: async () => {
      const ec = new ExcavatorController()
      return ec.dig()
    },
  },
  {
    id: "x_crane_set_boom",
    name: "Set Crane Boom",
    description: "Set crane boom angle and length.",
    parameters: {
      angle: { type: "number", description: "Boom angle (10-85)", required: true },
      length: { type: "number", description: "Boom length in meters (5-80)", required: true },
    },
    category: "construction",
    execute: async (args) => {
      const crane = new CraneController()
      return crane.setBoom(args.angle, args.length)
    },
  },
  {
    id: "x_crane_set_trolley",
    name: "Set Crane Trolley",
    description: "Set crane trolley position.",
    parameters: {
      position: { type: "number", description: "Trolley position (0-100%)", required: true },
    },
    category: "construction",
    execute: async (args) => {
      const crane = new CraneController()
      return crane.setTrolley(args.position)
    },
  },
  {
    id: "x_crane_check_wind",
    name: "Check Crane Wind",
    description: "Check wind conditions against crane limits.",
    parameters: {
      windSpeed: { type: "number", description: "Wind speed in km/h", required: true },
    },
    category: "construction",
    execute: async (args) => {
      const crane = new CraneController()
      return crane.checkWindLimit(args.windSpeed)
    },
  },
  {
    id: "x_concrete_set_ratio",
    name: "Set Concrete Ratio",
    description: "Set concrete mix ratio components.",
    parameters: {
      cement: { type: "number", description: "Cement parts", required: true },
      sand: { type: "number", description: "Sand parts", required: true },
      aggregate: { type: "number", description: "Aggregate parts", required: true },
      water: { type: "number", description: "Water parts", required: true },
    },
    category: "construction",
    execute: async (args) => {
      const cm = new ConcreteMixer()
      return cm.setRatio(args.cement, args.sand, args.aggregate, args.water)
    },
  },
  {
    id: "x_concrete_start_mix",
    name: "Start Concrete Mix",
    description: "Start mixing concrete.",
    parameters: {},
    category: "construction",
    execute: async () => {
      const cm = new ConcreteMixer()
      return cm.startMix()
    },
  },
  {
    id: "x_concrete_get_consistency",
    name: "Get Concrete Consistency",
    description: "Get concrete mix consistency measurement.",
    parameters: {},
    category: "construction",
    execute: async () => {
      const cm = new ConcreteMixer()
      return cm.getConsistency()
    },
  },
  {
    id: "x_construction_drone_set_site",
    name: "Set Survey Drone Site",
    description: "Set construction site boundary for drone survey.",
    parameters: {
      boundary: { type: "array", description: "Boundary points [{x, y}]", required: true },
    },
    category: "construction",
    execute: async (args) => {
      const sd = new SurveyDrone()
      return sd.setSite(args.boundary)
    },
  },
  {
    id: "x_construction_drone_capture",
    name: "Capture Survey Photos",
    description: "Capture aerial photos of construction site.",
    parameters: {},
    category: "construction",
    execute: async () => {
      const sd = new SurveyDrone()
      return sd.capturePhotos()
    },
  },
  {
    id: "x_construction_drone_get_model",
    name: "Get Survey 3D Model",
    description: "Generate 3D model from survey drone photos.",
    parameters: {},
    category: "construction",
    execute: async () => {
      const sd = new SurveyDrone()
      return sd.generate3DModel()
    },
  },
  {
    id: "x_bulldozer_set_blade",
    name: "Set Bulldozer Blade",
    description: "Set bulldozer blade angle and height.",
    parameters: {
      angle: { type: "number", description: "Blade angle (-30 to 30)", required: true },
      height: { type: "number", description: "Blade height (0-100%)", required: true },
    },
    category: "construction",
    execute: async (args) => {
      const bc = new BulldozerController()
      return bc.setBlade(args.angle, args.height)
    },
  },
  {
    id: "x_bulldozer_push",
    name: "Bulldozer Push",
    description: "Execute a push operation with the bulldozer.",
    parameters: {},
    category: "construction",
    execute: async () => {
      const bc = new BulldozerController()
      return bc.push()
    },
  },
  {
    id: "x_bulldozer_get_grade",
    name: "Get Bulldozer Grade",
    description: "Get current grade measurement.",
    parameters: {},
    category: "construction",
    execute: async () => {
      const bc = new BulldozerController()
      return bc.getGrade()
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PHYSICAL INTERFACE (8 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_arduino_connect", name: "Arduino Connect", description: "Connect to Arduino via serial port", parameters: { port: { type: "string", description: "Serial port path", required: true }, baudrate: { type: "number", description: "Baud rate" } }, category: "physical", execute: async (a) => new ArduinoController().connect(a.port, a.baudrate || 9600) },
  { id: "x_arduino_digital_write", name: "Arduino Digital Write", description: "Write digital value to Arduino pin", parameters: { port: { type: "string", required: true }, pin: { type: "number", required: true }, value: { type: "number", description: "0 or 1", required: true } }, category: "physical", execute: async (a) => { const c = new ArduinoController(); await c.connect(a.port); return c.digitalWrite(a.pin, a.value) } },
  { id: "x_arduino_analog_read", name: "Arduino Analog Read", description: "Read analog value from Arduino pin", parameters: { port: { type: "string", required: true }, pin: { type: "number", required: true } }, category: "physical", execute: async (a) => { const c = new ArduinoController(); await c.connect(a.port); return c.analogRead(a.pin) } },
  { id: "x_rpi_connect", name: "Raspberry Pi Connect", description: "Connect to Raspberry Pi via SSH", parameters: { ip: { type: "string", required: true }, user: { type: "string", required: true }, password: { type: "string", required: true } }, category: "physical", execute: async (a) => new RaspberryPiController().connect(a.ip, a.user, a.password) },
  { id: "x_rpi_gpio_read", name: "RPi GPIO Read", description: "Read GPIO pin on Raspberry Pi", parameters: { ip: { type: "string", required: true }, user: { type: "string", required: true }, password: { type: "string", required: true }, pin: { type: "number", required: true } }, category: "physical", execute: async (a) => { const c = new RaspberryPiController(); await c.connect(a.ip, a.user, a.password); return c.gpioRead(a.pin) } },
  { id: "x_can_connect", name: "CAN Bus Connect", description: "Connect to CAN bus interface", parameters: { interface: { type: "string", required: true }, bitrate: { type: "number" } }, category: "physical", execute: async (a) => new CANBusController().connect(a.interface, a.bitrate || 500000) },
  { id: "x_can_send", name: "CAN Send Frame", description: "Send CAN bus frame", parameters: { interface: { type: "string", required: true }, id: { type: "number", required: true }, data: { type: "array", required: true } }, category: "physical", execute: async (a) => { const c = new CANBusController(); await c.connect(a.interface); return c.sendFrame(a.id, a.data) } },
  { id: "x_i2c_read", name: "I2C Read Byte", description: "Read byte from I2C device", parameters: { bus: { type: "number", required: true }, address: { type: "number", required: true }, register: { type: "number", required: true } }, category: "physical", execute: async (a) => { const c = new I2CBusController(); await c.openBus(a.bus); return c.readByte(a.address, a.register) } },

  // ═══════════════════════════════════════════════════════════════════════════
  // SENSORS (8 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_lidar_connect", name: "LiDAR Connect", description: "Connect to LiDAR sensor", parameters: { protocol: { type: "string", required: true }, port: { type: "string", required: true } }, category: "sensor", execute: async (a) => new LiDARSensor().connect(a.protocol, a.port) },
  { id: "x_lidar_get_pointcloud", name: "LiDAR Point Cloud", description: "Get LiDAR point cloud data", parameters: { protocol: { type: "string", required: true }, port: { type: "string", required: true } }, category: "sensor", execute: async (a) => { const c = new LiDARSensor(); await c.connect(a.protocol, a.port); return c.getPointCloud() } },
  { id: "x_camera_connect", name: "Camera Connect", description: "Connect to camera sensor", parameters: { id: { type: "string", required: true }, width: { type: "number" }, height: { type: "number" } }, category: "sensor", execute: async (a) => new CameraSensor().connect(a.id, { width: a.width || 1920, height: a.height || 1080 }) },
  { id: "x_radar_connect", name: "Radar Connect", description: "Connect to radar sensor", parameters: { type: { type: "string", required: true }, frequency: { type: "number", required: true } }, category: "sensor", execute: async (a) => new RadarSensor().connect(a.type, a.frequency) },
  { id: "x_imu_connect", name: "IMU Connect", description: "Connect to IMU sensor", parameters: { port: { type: "string", required: true } }, category: "sensor", execute: async (a) => new IMUSensor().connect(a.port) },
  { id: "x_imu_get_accel", name: "IMU Acceleration", description: "Get IMU acceleration data", parameters: { port: { type: "string", required: true } }, category: "sensor", execute: async (a) => { const c = new IMUSensor(); await c.connect(a.port); return c.getAcceleration() } },
  { id: "x_ultrasonic_connect", name: "Ultrasonic Connect", description: "Connect ultrasonic sensor", parameters: { trigger: { type: "number", required: true }, echo: { type: "number", required: true } }, category: "sensor", execute: async (a) => new UltrasonicSensor().connect(a.trigger, a.echo) },
  { id: "x_thermal_connect", name: "Thermal Connect", description: "Connect thermal sensor", parameters: { port: { type: "string", required: true } }, category: "sensor", execute: async (a) => new ThermalSensor().connect(a.port) },

  // ═══════════════════════════════════════════════════════════════════════════
  // SDR (7 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_sdr_connect", name: "SDR Connect", description: "Connect SDR receiver", parameters: { device: { type: "string", required: true }, sampleRate: { type: "number", required: true }, frequency: { type: "number", required: true } }, category: "sdr", execute: async (a) => new SDRReceiver().connect(a.device, a.sampleRate, a.frequency) },
  { id: "x_sdr_get_fft", name: "SDR FFT", description: "Get FFT from SDR", parameters: { device: { type: "string", required: true }, sampleRate: { type: "number", required: true }, frequency: { type: "number", required: true } }, category: "sdr", execute: async (a) => { const c = new SDRReceiver(); c.connect(a.device, a.sampleRate, a.frequency); c.startCapture(); return c.getFFT() } },
  { id: "x_wifi_scan", name: "WiFi Scan", description: "Scan WiFi networks", parameters: {}, category: "sdr", execute: async () => new WiFiAnalyzer().scan() },
  { id: "x_bt_scan", name: "Bluetooth Scan", description: "Scan Bluetooth devices", parameters: {}, category: "sdr", execute: async () => new BluetoothScanner().scan() },
  { id: "x_lora_connect", name: "LoRa Connect", description: "Connect LoRa transceiver", parameters: { frequency: { type: "number", required: true }, spreading: { type: "number", required: true }, bandwidth: { type: "number", required: true } }, category: "sdr", execute: async (a) => new LoRaTransceiver().connect(a.frequency, a.spreading, a.bandwidth) },
  { id: "x_gps_connect", name: "GPS Connect", description: "Connect GPS receiver", parameters: { port: { type: "string", required: true }, baudrate: { type: "number" } }, category: "sdr", execute: async (a) => new GPSReceiver().connect(a.port, a.baudrate) },
  { id: "x_signal_analyze", name: "Signal Analyze", description: "Analyze signal characteristics", parameters: { data: { type: "array", required: true } }, category: "sdr", execute: async (a) => new SignalAnalyzer().analyze(a.data) },

  // ═══════════════════════════════════════════════════════════════════════════
  // SAFETY (7 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_failsafe_add_rule", name: "FailSafe Add Rule", description: "Add fail-safe rule", parameters: { id: { type: "string", required: true }, condition: { type: "string", required: true }, action: { type: "string", required: true } }, category: "safety", execute: async (a) => { const c = new FailSafeSystem(); c.addRule(a.id, a.condition, a.action); return { ok: true, data: { id: a.id } } } },
  { id: "x_watchdog_start", name: "Watchdog Start", description: "Start watchdog timer", parameters: { timeoutMs: { type: "number", required: true } }, category: "safety", execute: async (a) => new WatchdogTimer().start(a.timeoutMs) },
  { id: "x_emergency_activate", name: "Emergency Activate", description: "Activate emergency shutdown", parameters: { zoneId: { type: "string", required: true } }, category: "safety", execute: async (a) => { const c = new EmergencyShutdown(); c.activate(a.zoneId); return { ok: true } } },
  { id: "x_redundancy_add", name: "Redundancy Add Channel", description: "Add redundancy channel", parameters: { id: { type: "string", required: true }, priority: { type: "number", required: true } }, category: "safety", execute: async (a) => { const c = new RedundancyManager(); c.addChannel(a.id, a.priority); return { ok: true } } },
  { id: "x_fmea_add", name: "FMEA Add Component", description: "Add component for FMEA analysis", parameters: { id: { type: "string", required: true }, failureModes: { type: "array", required: true } }, category: "safety", execute: async (a) => { const c = new FMEAAnalyzer(); c.addComponent(a.id, a.failureModes); return { ok: true } } },
  { id: "x_interlock_add", name: "Safety Interlock Add", description: "Add safety interlock", parameters: { id: { type: "string", required: true }, condition: { type: "string", required: true }, lockedState: { type: "boolean", required: true } }, category: "safety", execute: async (a) => { const c = new SafetyInterlock(); c.addInterlock(a.id, a.condition, a.lockedState); return { ok: true } } },
  { id: "x_breaker_add", name: "Circuit Breaker Add", description: "Add circuit breaker", parameters: { id: { type: "string", required: true }, threshold: { type: "number", required: true }, timeout: { type: "number", required: true } }, category: "safety", execute: async (a) => { const c = new CircuitBreaker(); c.addCircuit(a.id, a.threshold, a.timeout); return { ok: true } } },

  // ═══════════════════════════════════════════════════════════════════════════
  // ML (6 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_vision_detect", name: "Vision Detect", description: "Detect objects in image", parameters: { model: { type: "string", required: true }, image: { type: "string", required: true } }, category: "ml", execute: async (a) => new VisionModel().detect(a.image) },
  { id: "x_nlp_analyze", name: "NLP Analyze", description: "Analyze text with NLP", parameters: { text: { type: "string", required: true } }, category: "ml", execute: async (a) => new NLPModel().analyze(a.text) },
  { id: "x_predict_add", name: "Prediction Add Dataset", description: "Add dataset for prediction", parameters: { name: { type: "string", required: true }, data: { type: "array", required: true } }, category: "ml", execute: async (a) => { const c = new PredictionEngine(); c.addDataset(a.name, a.data); return { ok: true } } },
  { id: "x_classify_add", name: "Classifier Add Class", description: "Add class to classifier", parameters: { label: { type: "string", required: true }, features: { type: "array", required: true } }, category: "ml", execute: async (a) => { const c = new ClassifierEngine(); c.addClass(a.label, a.features); return { ok: true } } },
  { id: "x_anomaly_add", name: "Anomaly Add Metric", description: "Add metric for anomaly detection", parameters: { name: { type: "string", required: true }, value: { type: "number", required: true } }, category: "ml", execute: async (a) => { const c = new AnomalyDetector(); c.addMetric(a.name, a.value); return { ok: true } } },
  { id: "x_rl_create_state", name: "RL Create State", description: "Create state for reinforcement learning", parameters: { id: { type: "string", required: true }, vars: { type: "array", required: true } }, category: "ml", execute: async (a) => { const c = new ReinforcementLearner(); c.createState(a.id, a.vars); return { ok: true } } },

  // ═══════════════════════════════════════════════════════════════════════════
  // DIGITAL TWIN (5 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_twin_create", name: "Digital Twin Create", description: "Create digital twin", parameters: { id: { type: "string", required: true }, type: { type: "string", required: true }, initialState: { type: "object", required: true } }, category: "digital-twin", execute: async (a) => new TwinManager().createTwin(a.id, a.type, a.initialState) },
  { id: "x_physics_add_body", name: "Physics Add Body", description: "Add physics body", parameters: { id: { type: "string", required: true }, mass: { type: "number", required: true }, position: { type: "object", required: true }, velocity: { type: "object", required: true } }, category: "digital-twin", execute: async (a) => new PhysicsEngine().addBody(a.id, a.mass, a.position, a.velocity) },
  { id: "x_scenario_create", name: "Scenario Create", description: "Create a what-if scenario for analysis and prediction", parameters: { id: { type: "string", required: true }, initialState: { type: "object", required: true }, events: { type: "array", required: true } }, category: "digital-twin", execute: async (a) => new ScenarioRunner().createScenario(a.id, a.initialState, a.events) },
  { id: "x_sync_add_source", name: "Sync Add Source", description: "Add state synchronization source", parameters: { id: { type: "string", required: true }, type: { type: "string", required: true }, connection: { type: "string", required: true } }, category: "digital-twin", execute: async (a) => new StateSynchronizer().addSource(a.id, a.type, a.connection) },
  { id: "x_sim_add_task", name: "Scheduler Add Task", description: "Add a scheduled task to monitor and analyze", parameters: { id: { type: "string", required: true }, interval: { type: "number", required: true } }, category: "digital-twin", execute: async (a) => { const c = new SimulationScheduler(); c.addTask(a.id, a.interval, () => {}); return { ok: true } } },

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARD (5 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_dash_create_panel", name: "Dashboard Create Panel", description: "Create dashboard panel", parameters: { id: { type: "string", required: true }, type: { type: "string", required: true }, config: { type: "object", required: true } }, category: "dashboard", execute: async (a) => new DashboardManager().createPanel(a.id, a.type, a.config) },
  { id: "x_chart_create", name: "Chart Create", description: "Create chart", parameters: { id: { type: "string", required: true }, type: { type: "string", required: true }, data: { type: "object", required: true } }, category: "dashboard", execute: async (a) => new ChartEngine().createChart(a.id, a.type, a.data) },
  { id: "x_status_add", name: "Status Add Metric", description: "Add status metric", parameters: { id: { type: "string", required: true }, name: { type: "string", required: true }, unit: { type: "string", required: true }, range: { type: "object", required: true } }, category: "dashboard", execute: async (a) => new StatusMonitor().addMetric(a.id, a.name, a.unit, a.range) },
  { id: "x_stream_create", name: "Real-Time Stream Create", description: "Create real-time stream", parameters: { id: { type: "string", required: true }, source: { type: "string", required: true } }, category: "dashboard", execute: async (a) => new RealTimeStream().createStream(a.id, a.source) },
  { id: "x_widget_create", name: "Widget Create", description: "Create widget", parameters: { id: { type: "string", required: true }, type: { type: "string", required: true }, config: { type: "object", required: true } }, category: "dashboard", execute: async (a) => new WidgetFactory().createWidget(a.id, a.type, a.config) },

  // ═══════════════════════════════════════════════════════════════════════════
  // ALERTS (4 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_alert_create", name: "Alert Create", description: "Create alert rule", parameters: { id: { type: "string", required: true }, condition: { type: "string", required: true }, severity: { type: "string", required: true }, message: { type: "string", required: true } }, category: "alert", execute: async (a) => new AlertManager().createAlert(a.id, a.condition, a.severity, a.message) },
  { id: "x_notify_add_channel", name: "Notification Add Channel", description: "Add notification channel", parameters: { id: { type: "string", required: true }, type: { type: "string", required: true }, config: { type: "object", required: true } }, category: "alert", execute: async (a) => { const c = new NotificationEngine(); c.addChannel(a.id, a.type, a.config); return { ok: true } } },
  { id: "x_escalation_create", name: "Escalation Create Policy", description: "Create escalation policy", parameters: { id: { type: "string", required: true }, levels: { type: "array", required: true } }, category: "alert", execute: async (a) => new EscalationPolicy().createPolicy(a.id, a.levels) },
  { id: "x_anomaly_alert_add", name: "Anomaly Alerter Add", description: "Add metric for anomaly alerting", parameters: { id: { type: "string", required: true }, baseline: { type: "number", required: true }, threshold: { type: "number", required: true } }, category: "alert", execute: async (a) => new AnomalyAlerter().addMetric(a.id, a.baseline, a.threshold) },

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA LOGGER (5 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_tsdb_create", name: "TimeSeries Create", description: "Create time series measurement", parameters: { name: { type: "string", required: true }, tags: { type: "object", required: true } }, category: "data-logger", execute: async (a) => new TimeSeriesDB().createMeasurement(a.name, a.tags) },
  { id: "x_event_log", name: "Event Log", description: "Log event", parameters: { source: { type: "string", required: true }, level: { type: "string", required: true }, message: { type: "string", required: true }, data: { type: "object" } }, category: "data-logger", execute: async (a) => new EventLogger().log(a.source, a.level, a.message, a.data) },
  { id: "x_audit_record", name: "Audit Record", description: "Record audit trail entry", parameters: { userId: { type: "string", required: true }, action: { type: "string", required: true }, resource: { type: "string", required: true }, details: { type: "object" } }, category: "data-logger", execute: async (a) => new AuditTrail().record(a.userId, a.action, a.resource, a.details) },
  { id: "x_export_csv", name: "Export CSV", description: "Export data as CSV", parameters: { data: { type: "array", required: true } }, category: "data-logger", execute: async (a) => new DataExporter().exportCSV(a.data) },
  { id: "x_storage_allocate", name: "Storage Allocate", description: "Allocate storage", parameters: { name: { type: "string", required: true }, size: { type: "number", required: true } }, category: "data-logger", execute: async (a) => new StorageManager().allocate(a.name, a.size) },

  // ═══════════════════════════════════════════════════════════════════════════
  // REMOTE CONTROL (6 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_ws_start", name: "WebSocket Start", description: "Start WebSocket server", parameters: { port: { type: "number", required: true } }, category: "remote", execute: async (a) => new WebSocketServer().start(a.port) },
  { id: "x_rest_add_route", name: "REST Add Route", description: "Add REST API route", parameters: { method: { type: "string", required: true }, path: { type: "string", required: true } }, category: "remote", execute: async (a) => { const c = new RESTAPI(); c.addRoute(a.method, a.path, () => ({})); return { ok: true } } },
  { id: "x_auth_add_client", name: "Network Auth Add Client", description: "Add network client", parameters: { id: { type: "string", required: true }, key: { type: "string", required: true }, role: { type: "string", required: true } }, category: "remote", execute: async (a) => new NetworkAuth().addClient(a.id, a.key, a.role) },
  { id: "x_remote_connect", name: "Remote Session Connect", description: "Connect remote session", parameters: { target: { type: "string", required: true }, credentials: { type: "object", required: true } }, category: "remote", execute: async (a) => new RemoteSession().connect(a.target, a.credentials) },
  { id: "x_cmd_register", name: "Command Register", description: "Register command", parameters: { name: { type: "string", required: true } }, category: "remote", execute: async (a) => { const c = new CommandProtocol(); c.registerCommand(a.name, () => ({})); return { ok: true } } },
  { id: "x_heartbeat_start", name: "Heartbeat Start", description: "Start heartbeat monitor", parameters: { target: { type: "string", required: true }, intervalMs: { type: "number", required: true } }, category: "remote", execute: async (a) => new HeartbeatMonitor().start(a.target, a.intervalMs) },

  // ═══════════════════════════════════════════════════════════════════════════
  // PREDICTIVE MAINTENANCE (6 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_failure_add", name: "Failure Predictor Add", description: "Add component for failure prediction", parameters: { id: { type: "string", required: true }, type: { type: "string", required: true }, readings: { type: "array", required: true } }, category: "predictive", execute: async (a) => { const c = new FailurePredictor(); c.addComponent(a.id, a.type, a.readings); return { ok: true } } },
  { id: "x_maint_add_task", name: "Maintenance Add Task", description: "Add maintenance task", parameters: { id: { type: "string", required: true }, componentId: { type: "string", required: true }, interval: { type: "number", required: true }, priority: { type: "string", required: true } }, category: "predictive", execute: async (a) => { const c = new MaintenanceScheduler(); c.addTask(a.id, a.componentId, a.interval, a.priority); return { ok: true } } },
  { id: "x_spare_add", name: "Spare Parts Add", description: "Add spare part", parameters: { id: { type: "string", required: true }, name: { type: "string", required: true }, quantity: { type: "number", required: true }, minStock: { type: "number", required: true } }, category: "predictive", execute: async (a) => { const c = new SparePartsManager(); c.addPart(a.id, a.name, a.quantity, a.minStock); return { ok: true } } },
  { id: "x_vibration_add", name: "Vibration Add Sensor", description: "Add vibration sensor", parameters: { id: { type: "string", required: true }, location: { type: "string", required: true } }, category: "predictive", execute: async (a) => { const c = new VibrationAnalyzer(); c.addSensor(a.id, a.location); return { ok: true } } },
  { id: "x_oil_add", name: "Oil Analysis Add Sample", description: "Add oil sample", parameters: { componentId: { type: "string", required: true }, viscosity: { type: "number", required: true }, metalContent: { type: "number", required: true } }, category: "predictive", execute: async (a) => { const c = new OilAnalyzer(); c.addSample(a.componentId, a.viscosity, a.metalContent, 0, 7); return { ok: true } } },
  { id: "x_thermal_trend_add", name: "Thermal Trend Add Sensor", description: "Add thermal trend sensor", parameters: { id: { type: "string", required: true }, location: { type: "string", required: true } }, category: "predictive", execute: async (a) => { const c = new ThermalTrendAnalyzer(); c.addSensor(a.id, a.location); return { ok: true } } },

  // ═══════════════════════════════════════════════════════════════════════════
  // DECISION SUPPORT (6 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_decision_add_option", name: "Decision Add Option", description: "Add decision option", parameters: { id: { type: "string", required: true }, name: { type: "string", required: true }, pros: { type: "array", required: true }, cons: { type: "array", required: true }, weight: { type: "number", required: true } }, category: "decision", execute: async (a) => { const c = new DecisionEngine(); c.addOption(a.id, a.name, a.pros, a.cons, a.weight); return { ok: true } } },
  { id: "x_scenario_analyze", name: "Scenario Analyzer Create", description: "Create analysis scenario", parameters: { id: { type: "string", required: true }, variables: { type: "object", required: true }, events: { type: "array", required: true } }, category: "decision", execute: async (a) => new ScenarioAnalyzer().createScenario(a.id, a.variables, a.events) },
  { id: "x_risk_add", name: "Risk Add", description: "Add risk for assessment", parameters: { id: { type: "string", required: true }, probability: { type: "number", required: true }, impact: { type: "number", required: true }, category: { type: "string", required: true } }, category: "decision", execute: async (a) => { const c = new RiskAssessor(); c.addRisk(a.id, a.probability, a.impact, a.category); return { ok: true } } },
  { id: "x_tradeoff_add", name: "Tradeoff Add", description: "Add tradeoff analysis", parameters: { id: { type: "string", required: true }, options: { type: "array", required: true }, criteria: { type: "array", required: true } }, category: "decision", execute: async (a) => { const c = new TradeoffAnalyzer(); c.addTradeoff(a.id, a.options, a.criteria); return { ok: true } } },
  { id: "x_tree_create", name: "Decision Tree Create", description: "Create decision tree", parameters: { id: { type: "string", required: true }, root: { type: "object", required: true } }, category: "decision", execute: async (a) => new DecisionTree().createTree(a.id, a.root) },
  { id: "x_causal_add_var", name: "Causal Add Variable", description: "Add causal variable", parameters: { id: { type: "string", required: true }, name: { type: "string", required: true }, type: { type: "string", required: true } }, category: "decision", execute: async (a) => { const c = new CausalAnalyzer(); c.addVariable(a.id, a.name, a.type); return { ok: true } } },

  // ═══════════════════════════════════════════════════════════════════════════
  // AUTHORIZATION (6 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_rbac_add_role", name: "RBAC Add Role", description: "Add role", parameters: { id: { type: "string", required: true }, permissions: { type: "array", required: true } }, category: "auth", execute: async (a) => { const c = new RBACManager(); c.addRole(a.id, a.permissions); return { ok: true } } },
  { id: "x_auth_add_user", name: "Auth Add User", description: "Add user for authentication", parameters: { id: { type: "string", required: true }, password: { type: "string", required: true }, mfa: { type: "boolean" } }, category: "auth", execute: async (a) => new AuthenticationEngine().addUser(a.id, a.password, a.mfa) },
  { id: "x_policy_add", name: "Policy Add", description: "Add access policy", parameters: { id: { type: "string", required: true }, rules: { type: "array", required: true }, effect: { type: "string", required: true } }, category: "auth", execute: async (a) => { const c = new PolicyEngine(); c.addPolicy(a.id, a.rules, a.effect); return { ok: true } } },
  { id: "x_access_log", name: "Access Log", description: "Log access event", parameters: { userId: { type: "string", required: true }, resource: { type: "string", required: true }, action: { type: "string", required: true }, result: { type: "string", required: true } }, category: "auth", execute: async (a) => new AccessLog().log(a.userId, a.resource, a.action, a.result) },
  { id: "x_token_create", name: "Token Create", description: "Create auth token", parameters: { userId: { type: "string", required: true }, permissions: { type: "array", required: true }, expiry: { type: "number", required: true } }, category: "auth", execute: async (a) => new TokenManager().createToken(a.userId, a.permissions, a.expiry) },
  { id: "x_cert_generate", name: "Certificate Generate", description: "Generate certificate", parameters: { subject: { type: "string", required: true }, validDays: { type: "number", required: true } }, category: "auth", execute: async (a) => new CertificateManager().generateCert(a.subject, a.validDays) },

  // ═══════════════════════════════════════════════════════════════════════════
  // COMMON SENSE (6 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_reason_add_fact", name: "Reasoning Add Fact", description: "Add fact for reasoning", parameters: { id: { type: "string", required: true }, content: { type: "string", required: true }, confidence: { type: "number", required: true } }, category: "common-sense", execute: async (a) => { const c = new ReasoningEngine(); c.addFact(a.id, a.content, a.confidence); return { ok: true } } },
  { id: "x_causal_add_link", name: "Causal Add Link", description: "Add causal link", parameters: { causeId: { type: "string", required: true }, effectId: { type: "string", required: true }, strength: { type: "number", required: true } }, category: "common-sense", execute: async (a) => { const c = new CausalInference(); c.addCausalLink(a.causeId, a.effectId, a.strength); return { ok: true } } },
  { id: "x_world_add_object", name: "World Model Add Object", description: "Add object to world model", parameters: { id: { type: "string", required: true }, type: { type: "string", required: true }, properties: { type: "object", required: true } }, category: "common-sense", execute: async (a) => { const c = new WorldModel(); c.addObject(a.id, a.type, a.properties); return { ok: true } } },
  { id: "x_context_set", name: "Context Set", description: "Set context", parameters: { id: { type: "string", required: true }, data: { type: "object", required: true } }, category: "common-sense", execute: async (a) => { const c = new ContextManager(); c.setContext(a.id, a.data); return { ok: true } } },
  { id: "x_analogy_add", name: "Analogy Add", description: "Add analogy", parameters: { source: { type: "string", required: true }, target: { type: "string", required: true }, mappings: { type: "object", required: true } }, category: "common-sense", execute: async (a) => { const c = new AnalogyEngine(); c.addAnalogy(a.source, a.target, a.mappings); return { ok: true } } },
  { id: "x_spatial_add_obj", name: "Spatial Add Object", description: "Add spatial object", parameters: { id: { type: "string", required: true }, position: { type: "object", required: true }, dimensions: { type: "object", required: true }, type: { type: "string", required: true } }, category: "common-sense", execute: async (a) => { const c = new SpatialReasoning(); c.addObject(a.id, a.position, a.dimensions, a.type); return { ok: true } } },

  // ═══════════════════════════════════════════════════════════════════════════
  // ETHICS (5 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_ethics_add_principle", name: "Ethics Add Principle", description: "Add ethical principle", parameters: { id: { type: "string", required: true }, name: { type: "string", required: true }, weight: { type: "number", required: true } }, category: "ethics", execute: async (a) => { const c = new EthicalFramework(); c.addPrinciple(a.id, a.name, a.weight); return { ok: true } } },
  { id: "x_bias_add_dataset", name: "Bias Add Dataset", description: "Add dataset for bias detection", parameters: { name: { type: "string", required: true }, data: { type: "array", required: true }, protectedAttributes: { type: "array", required: true } }, category: "ethics", execute: async (a) => { const c = new BiasDetector(); c.addDataset(a.name, a.data, a.protectedAttributes); return { ok: true } } },
  { id: "x_fairness_add_model", name: "Fairness Add Model", description: "Add model for fairness analysis", parameters: { modelId: { type: "string", required: true }, predictions: { type: "array", required: true }, actual: { type: "array", required: true } }, category: "ethics", execute: async (a) => { const c = new FairnessAnalyzer(); c.addModel(a.modelId, a.predictions, a.actual); return { ok: true } } },
  { id: "x_transparency_add", name: "Transparency Add Decision", description: "Add decision for transparency", parameters: { id: { type: "string", required: true }, inputs: { type: "object", required: true }, outputs: { type: "object", required: true }, reasoning: { type: "string", required: true } }, category: "ethics", execute: async (a) => { const c = new TransparencyEngine(); c.addDecision(a.id, a.inputs, a.outputs, a.reasoning); return { ok: true } } },
  { id: "x_safety_validate", name: "Safety Validate Action", description: "Validate action safety", parameters: { action: { type: "string", required: true }, context: { type: "object", required: true } }, category: "ethics", execute: async (a) => new SafetyValidator().validate(a.action, a.context) },

  // ═══════════════════════════════════════════════════════════════════════════
  // CREATIVITY (5 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_idea_add_concept", name: "Idea Add Concept", description: "Add concept for ideation", parameters: { id: { type: "string", required: true }, keywords: { type: "array", required: true }, connections: { type: "array", required: true } }, category: "creativity", execute: async (a) => { const c = new IdeaGenerator(); c.addConcept(a.id, a.keywords, a.connections); return { ok: true } } },
  { id: "x_innovation_add_tech", name: "Innovation Add Technology", description: "Add technology for innovation", parameters: { id: { type: "string", required: true }, capabilities: { type: "array", required: true } }, category: "creativity", execute: async (a) => { const c = new InnovationEngine(); c.addTechnology(a.id, a.capabilities); return { ok: true } } },
  { id: "x_design_create_project", name: "Design Thinking Create", description: "Create design thinking project", parameters: { id: { type: "string", required: true }, problem: { type: "string", required: true } }, category: "creativity", execute: async (a) => new DesignThinking().createProject(a.id, a.problem) },
  { id: "x_pattern_add", name: "Pattern Add", description: "Add pattern for synthesis", parameters: { id: { type: "string", required: true }, data: { type: "array", required: true }, type: { type: "string", required: true } }, category: "creativity", execute: async (a) => { const c = new PatternSynthesizer(); c.addPattern(a.id, a.data, a.type); return { ok: true } } },
  { id: "x_relax_add_problem", name: "Constraint Relax Add Problem", description: "Add problem for constraint relaxation", parameters: { id: { type: "string", required: true }, constraints: { type: "array", required: true }, objective: { type: "string", required: true } }, category: "creativity", execute: async (a) => { const c = new ConstraintRelaxer(); c.addProblem(a.id, a.constraints, a.objective); return { ok: true } } },

  // ═══════════════════════════════════════════════════════════════════════════
  // ULTRA X TOOLS — SINGULARITY TIER (15 tools)
  // ═══════════════════════════════════════════════════════════════════════════

  // Universal Command Engine
  { id: "x_uce_process", name: "Universal Command Process", description: "Process ANY natural language command and execute it", parameters: { command: { type: "string", description: "Natural language command", required: true } }, category: "ultra-x", execute: async (a) => { const { UniversalCommandEngine } = await import("./universal-command"); const e = new UniversalCommandEngine(); return { ok: true, data: await e.processCommand(a.command) } } },
  { id: "x_uce_devices", name: "Universal Command Devices", description: "List all available devices for command execution", parameters: {}, category: "ultra-x", execute: async () => { const { UniversalCommandEngine } = await import("./universal-command"); return { ok: true, data: new UniversalCommandEngine().getDevices() } } },
  { id: "x_uce_history", name: "Universal Command History", description: "Get command execution history", parameters: {}, category: "ultra-x", execute: async () => { const { UniversalCommandEngine } = await import("./universal-command"); return { ok: true, data: new UniversalCommandEngine().getHistory() } } },

  // Reality Bridge
  { id: "x_rb_register", name: "Reality Bridge Register Device", description: "Register an IoT device", parameters: { id: { type: "string", required: true }, name: { type: "string", required: true }, type: { type: "string", required: true }, protocol: { type: "string", required: true }, location: { type: "string", required: true } }, category: "ultra-x", execute: async (a) => { const { RealityBridge } = await import("./reality-bridge"); const b = new RealityBridge(); b.registerDevice({ id: a.id, name: a.name, type: a.type, protocol: a.protocol, state: {}, capabilities: [], location: a.location, lastSeen: Date.now() }); return { ok: true } } },
  { id: "x_rb_control", name: "Reality Bridge Control Device", description: "Control an IoT device", parameters: { deviceId: { type: "string", required: true }, command: { type: "string", required: true }, params: { type: "object" } }, category: "ultra-x", execute: async (a) => { const { RealityBridge } = await import("./reality-bridge"); return { ok: true, data: await new RealityBridge().controlDevice(a.deviceId, a.command, a.params) } } },
  { id: "x_rb_states", name: "Reality Bridge Get States", description: "Get all device states", parameters: {}, category: "ultra-x", execute: async () => { const { RealityBridge } = await import("./reality-bridge"); return { ok: true, data: await new RealityBridge().getDeviceStates() } } },
  { id: "x_rb_scene_create", name: "Reality Bridge Create Scene", description: "Create an automation scene", parameters: { id: { type: "string", required: true }, name: { type: "string", required: true }, devices: { type: "array", required: true } }, category: "ultra-x", execute: async (a) => { const { RealityBridge } = await import("./reality-bridge"); const b = new RealityBridge(); b.createScene({ id: a.id, name: a.name, devices: a.devices }); return { ok: true } } },
  { id: "x_rb_scene_activate", name: "Reality Bridge Activate Scene", description: "Activate an automation scene", parameters: { sceneId: { type: "string", required: true } }, category: "ultra-x", execute: async (a) => { const { RealityBridge } = await import("./reality-bridge"); return { ok: true, data: await new RealityBridge().activateScene(a.sceneId) } } },

  // Omni Creator
  { id: "x_oc_create", name: "Omni Creator Create", description: "Create anything: app, website, game, music, video, art, document", parameters: { type: { type: "string", description: "Type: app|website|game|music|video|art|document|api|database|automation", required: true }, name: { type: "string", required: true }, description: { type: "string", required: true }, framework: { type: "string" }, style: { type: "string" }, duration: { type: "number" } }, category: "ultra-x", execute: async (a) => { const { OmniCreator } = await import("./omni-creator"); return { ok: true, data: await new OmniCreator().create(a) } } },
  { id: "x_oc_templates", name: "Omni Creator Templates", description: "List available creation templates", parameters: {}, category: "ultra-x", execute: async () => { const { OmniCreator } = await import("./omni-creator"); return { ok: true, data: new OmniCreator().getTemplates() } } },
  { id: "x_oc_projects", name: "Omni Creator Projects", description: "List created projects", parameters: {}, category: "ultra-x", execute: async () => { const { OmniCreator } = await import("./omni-creator"); return { ok: true, data: new OmniCreator().listProjects() } } },

  // Time Manipulator
  { id: "x_tm_timeline", name: "Time Manipulator Timeline", description: "Reconstruct codebase timeline", parameters: { start: { type: "string" }, end: { type: "string" } }, category: "ultra-x", execute: async (a) => { const { TimeManipulator } = await import("./time-manipulator"); return { ok: true, data: new TimeManipulator().reconstructTimeline() } } },
  { id: "x_tm_snapshot", name: "Time Manipulator Snapshot", description: "Get codebase state at a specific date", parameters: { date: { type: "string", required: true } }, category: "ultra-x", execute: async (a) => { const { TimeManipulator } = await import("./time-manipulator"); return { ok: true, data: new TimeManipulator().getSnapshotAt(new Date(a.date)) } } },
  { id: "x_tm_evolution", name: "Time Manipulator Evolution", description: "Analyze codebase evolution", parameters: {}, category: "ultra-x", execute: async () => { const { TimeManipulator } = await import("./time-manipulator"); return { ok: true, data: new TimeManipulator().analyzeEvolution() } } },
  { id: "x_tm_predict", name: "Time Manipulator Predict", description: "Predict future codebase state", parameters: { commitsAhead: { type: "number" } }, category: "ultra-x", execute: async (a) => { const { TimeManipulator } = await import("./time-manipulator"); return { ok: true, data: new TimeManipulator().predictFuture(a.commitsAhead) } } },
  { id: "x_tm_bugs", name: "Time Manipulator Bug Patterns", description: "Find bug patterns in codebase history", parameters: {}, category: "ultra-x", execute: async () => { const { TimeManipulator } = await import("./time-manipulator"); return { ok: true, data: new TimeManipulator().findBugPatterns() } } },

  // Consciousness Transfer
  { id: "x_ct_register", name: "Consciousness Register Agent", description: "Register an agent for consciousness transfer", parameters: { agentId: { type: "string", required: true }, name: { type: "string", required: true }, skills: { type: "array", required: true }, traits: { type: "array", required: true }, tone: { type: "string", required: true }, expertise: { type: "array", required: true } }, category: "ultra-x", execute: async (a) => { const { ConsciousnessTransfer } = await import("./consciousness-transfer"); const c = new ConsciousnessTransfer(); c.registerAgent({ agentId: a.agentId, name: a.name, skills: a.skills, memory: [], context: {}, personality: { traits: a.traits, tone: a.tone, expertise: a.expertise }, lastActive: Date.now() }); return { ok: true } } },
  { id: "x_ct_transfer", name: "Consciousness Transfer Knowledge", description: "Transfer knowledge between agents", parameters: { fromAgent: { type: "string", required: true }, toAgent: { type: "string", required: true }, memory: { type: "array" }, context: { type: "object" }, skills: { type: "array" }, instructions: { type: "array" } }, category: "ultra-x", execute: async (a) => { const { ConsciousnessTransfer } = await import("./consciousness-transfer"); const c = new ConsciousnessTransfer(); const pkg = c.createTransferPackage(a.fromAgent, a.toAgent, { memory: a.memory || [], context: a.context || {}, skills: a.skills || [], instructions: a.instructions || [] }); return { ok: true, data: await c.executeTransfer(pkg.id) } } },
  { id: "x_ct_collab", name: "Consciousness Start Collaboration", description: "Start multi-agent collaboration session", parameters: { task: { type: "string", required: true }, agentIds: { type: "array", required: true } }, category: "ultra-x", execute: async (a) => { const { ConsciousnessTransfer } = await import("./consciousness-transfer"); return { ok: true, data: new ConsciousnessTransfer().startCollaboration(a.task, a.agentIds) } } },
  { id: "x_ct_agents", name: "Consciousness List Agents", description: "List all registered agents", parameters: {}, category: "ultra-x", execute: async () => { const { ConsciousnessTransfer } = await import("./consciousness-transfer"); return { ok: true, data: new ConsciousnessTransfer().getAllAgents() } } },

  // Self-Evolving Codebase
  { id: "x_se_analyze", name: "Self-Evolving Analyze Code", description: "Analyze code for patterns and quality", parameters: { code: { type: "string", required: true }, filePath: { type: "string", required: true } }, category: "ultra-x", execute: async (a) => { const { SelfEvolvingCodebase } = await import("./self-evolve"); return { ok: true, data: new SelfEvolvingCodebase().analyzeCode(a.code, a.filePath) } } },
  { id: "x_se_suggest", name: "Self-Evolving Suggest Refactor", description: "Generate refactoring suggestions", parameters: { code: { type: "string", required: true }, filePath: { type: "string", required: true } }, category: "ultra-x", execute: async (a) => { const { SelfEvolvingCodebase } = await import("./self-evolve"); return { ok: true, data: new SelfEvolvingCodebase().generateSuggestions(a.code, a.filePath) } } },
  { id: "x_se_trend", name: "Self-Evolving Evolution Trend", description: "Get codebase evolution trend", parameters: {}, category: "ultra-x", execute: async () => { const { SelfEvolvingCodebase } = await import("./self-evolve"); return { ok: true, data: new SelfEvolvingCodebase().getEvolutionTrend() } } },

  // Emotion-Aware Computing
  { id: "x_ea_analyze", name: "Emotion Analyze Text", description: "Analyze text for user emotion", parameters: { text: { type: "string", required: true } }, category: "ultra-x", execute: async (a) => { const { EmotionAwareComputing } = await import("./emotion-aware"); return { ok: true, data: new EmotionAwareComputing().analyzeTextSentiment(a.text) } } },
  { id: "x_ea_adapt", name: "Emotion Get Adaptation", description: "Get response adaptation for current emotion", parameters: { emotion: { type: "string" } }, category: "ultra-x", execute: async (a) => { const { EmotionAwareComputing } = await import("./emotion-aware"); return { ok: true, data: new EmotionAwareComputing().getAdaptation(a.emotion) } } },
  { id: "x_ea_mood", name: "Emotion Get Mood Trend", description: "Get user mood trend", parameters: {}, category: "ultra-x", execute: async () => { const { EmotionAwareComputing } = await import("./emotion-aware"); return { ok: true, data: new EmotionAwareComputing().getMoodTrend() } } },

  // Memory Palace
  { id: "x_mp_store", name: "Memory Palace Store", description: "Store a memory in the infinite palace", parameters: { type: { type: "string", description: "Type: conversation|code_change|decision|fact|person|project|emotion|skill", required: true }, content: { type: "any", required: true }, tags: { type: "array" }, importance: { type: "number" } }, category: "ultra-x", execute: async (a) => { const { MemoryPalace } = await import("./memory-palace"); return { ok: true, data: new MemoryPalace().store(a.type, a.content, a.tags, a.importance) } } },
  { id: "x_mp_query", name: "Memory Palace Query", description: "Query the infinite memory palace", parameters: { text: { type: "string" }, type: { type: "string" }, tags: { type: "array" }, minImportance: { type: "number" }, limit: { type: "number" } }, category: "ultra-x", execute: async (a) => { const { MemoryPalace } = await import("./memory-palace"); return { ok: true, data: new MemoryPalace().query(a) } } },
  { id: "x_mp_stats", name: "Memory Palace Stats", description: "Get memory palace statistics", parameters: {}, category: "ultra-x", execute: async () => { const { MemoryPalace } = await import("./memory-palace"); return { ok: true, data: new MemoryPalace().getStats() } } },
  { id: "x_mp_connect", name: "Memory Palace Connect", description: "Connect two memories", parameters: { id1: { type: "string", required: true }, id2: { type: "string", required: true } }, category: "ultra-x", execute: async (a) => { const { MemoryPalace } = await import("./memory-palace"); new MemoryPalace().connect(a.id1, a.id2); return { ok: true } } },

  // Reality Analyzer
  { id: "x_rs_simulate", name: "Reality Analyze Scenario", description: "Analyze a what-if scenario and predict outcomes before making changes", parameters: { id: { type: "string", required: true }, name: { type: "string", required: true }, description: { type: "string", required: true }, baseline: { type: "object", required: true }, changes: { type: "array", required: true }, constraints: { type: "array" } }, category: "ultra-x", execute: async (a) => { const { RealitySimulator } = await import("./reality-sim"); const s = new RealitySimulator(); s.createScenario(a); return { ok: true, data: await s.simulate(a.id) } } },
  { id: "x_rs_results", name: "Reality Analyzer Results", description: "Get analysis results from scenario evaluation", parameters: {}, category: "ultra-x", execute: async () => { const { RealitySimulator } = await import("./reality-sim"); return { ok: true, data: new RealitySimulator().getResults() } } },

  // Singularity Engine
  { id: "x_singularity_process", name: "Singularity Process Request", description: "Process ANY request through the ultimate engine", parameters: { request: { type: "string", description: "Any request in natural language", required: true } }, category: "ultra-x", execute: async (a) => { const { SingularityEngine } = await import("./singularity"); return { ok: true, data: await new SingularityEngine().processRequest(a.request) } } },
  { id: "x_singularity_heal", name: "Singularity Self-Heal", description: "Trigger self-healing for an error", parameters: { error: { type: "string", required: true } }, category: "ultra-x", execute: async (a) => { const { SingularityEngine } = await import("./singularity"); return { ok: true, data: new SingularityEngine().heal(a.error) } } },
  { id: "x_singularity_learn", name: "Singularity Learn", description: "Teach the engine new knowledge", parameters: { key: { type: "string", required: true }, value: { type: "any", required: true } }, category: "ultra-x", execute: async (a) => { const { SingularityEngine } = await import("./singularity"); new SingularityEngine().learn(a.key, a.value); return { ok: true } } },
  { id: "x_singularity_state", name: "Singularity State", description: "Get the engine's current state", parameters: {}, category: "ultra-x", execute: async () => { const { SingularityEngine } = await import("./singularity"); const e = new SingularityEngine(); return { ok: true, data: { state: e.getState(), summary: e.getCapabilitySummary(), capabilities: e.getCapabilities(), goals: e.getGoals() } } } },
  { id: "x_singularity_evolution", name: "Singularity Evolution Steps", description: "Get all evolution/improvement steps", parameters: {}, category: "ultra-x", execute: async () => { const { SingularityEngine } = await import("./singularity"); return { ok: true, data: new SingularityEngine().getEvolutionSteps() } } },

  // ═══════════════════════════════════════════════════════════════════════════
  // CODE GUARDIAN — Real-Time Code Intelligence (4 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_guardian_scan", name: "Code Guardian Scan", description: "Scan code for errors, fake data, Math.random, security issues", parameters: { file: { type: "string", required: true }, code: { type: "string", required: true } }, category: "code-guardian", execute: async (a) => { const { CodeGuardianScanner } = await import("./code-guardian"); return { ok: true, data: new CodeGuardianScanner().scan(a.file, a.code) } } },
  { id: "x_guardian_context", name: "Code Guardian AI Context", description: "Get pending error context for AI to fix", parameters: {}, category: "code-guardian", execute: async () => { const { CodeGuardianAIFeedback } = await import("./code-guardian"); const fb = new CodeGuardianAIFeedback(); return { ok: true, data: { context: fb.generateAIContext(), hasErrors: fb.hasPendingErrors(), counts: fb.getErrorCounts() } } } },
  { id: "x_guardian_status", name: "Code Guardian Status", description: "Get Code Guardian channel status", parameters: {}, category: "code-guardian", execute: async () => { const { CodeGuardianAIFeedback } = await import("./code-guardian"); return { ok: true, data: new CodeGuardianAIFeedback().getStatus() } } },
  { id: "x_guardian_clear", name: "Code Guardian Clear", description: "Clear all pending errors", parameters: {}, category: "code-guardian", execute: async () => { const { CodeGuardianAIFeedback } = await import("./code-guardian"); new CodeGuardianAIFeedback().clear(); return { ok: true } } },
]

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

export function getToolsByCategory(category: string): XToolDef[] {
  return xToolRegistry.filter(t => t.category === category)
}

export function getToolById(id: string): XToolDef | undefined {
  return xToolRegistry.find(t => t.id === id)
}

export function getAllCategories(): string[] {
  return [...new Set(xToolRegistry.map(t => t.category))]
}
