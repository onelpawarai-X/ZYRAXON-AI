import { Effect, Schema } from "effect"
import type { JSONSchema7 } from "@ai-sdk/provider"
import { getCurrentTier, hasAccess, getToolRequiredTier, TIER_ORDER, type Tier } from "../subscription/canonical"
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
import { MatrixOperations, CalculusEngine, StatisticsEngine, NumberTheory, GeometryEngine, CombinatoricsEngine, ClassicalMechanics, Thermodynamics, Electromagnetism, Relativity, WaveMechanics, Stoichiometry, GasLaws, AcidBase, Genetics, Ecology, Biochemistry, CivilEngineering, MechanicalEngineering, ElectricalEngineering, FinancialCalculations, DataScience, SecurityTools, DailyLifeTools, MemorySystem, DocumentTools, SkillCreator } from "./x-tools-extended"
import { AstronomyTools, GeologyTools, MeteorologyTools, OceanographyTools, MaterialsScienceTools, LinguisticsTools, MusicTheoryTools, GameMechanicsTools, BlockchainTools, NetworkingTools, DevOpsTools, DatabaseTools, QuantumComputingTools, RoboticsTools } from "./x-tools-extended-v2"
import { DroneController, CarController, BoatController, RocketController, SatelliteController, ZyraxonVehicles } from "./vehicles"
import { UniversalCommandEngine } from "./universal-command"
import { cdpBrowserTools, computerControlTools, planningTools, mediaTools, selfImproveTools } from "./advanced-tools"
import { nuphusMcpTools, touchpointMcpTools } from "./mcp-tool-fallbacks"
import * as fs from "fs"
import * as path from "path"
import * as os from "os"

export type XToolDef = {
  id: string
  name: string
  description: string
  parameters: Record<string, { type: string; description: string; required?: boolean }>
  category: string
  execute: (args: any) => Promise<{ ok: boolean; data?: any; error?: string }>
}

export { getCurrentTier, hasAccess, getToolRequiredTier, TIER_ORDER }
export type { Tier }

const TOOL_TIER_MAP: Record<string, Tier> = {
  // PRO tools
  task: "pro", plan: "pro", apply_patch: "pro", code_analyzer: "pro", api_tester: "pro",
  system_info: "pro", screen_vision: "pro", self_evolve: "pro", code_mode: "pro", mcp_websearch: "pro",
  x_atc_connect: "pro", x_atc_disconnect: "pro", x_atc_tune: "pro", x_atc_set_squawk: "pro",
  x_atc_request_clearance: "pro", x_atc_read_back: "pro", x_atc_declare_emergency: "pro",
  x_weather_parse_metar: "pro", x_weather_check_turbulence: "pro", x_weather_check_icing: "pro",
  x_weather_get_winds_aloft: "pro", x_notam_add: "pro", x_notam_get_by_location: "pro",
  x_notam_check_runway: "pro", x_runway_set_condition: "pro", x_runway_calc_landing_distance: "pro",
  x_runway_get_braking: "pro", x_tcas_detect_traffic: "pro", x_tcas_calculate_resolution: "pro",
  x_pilot_request_override: "pro", x_pilot_release_override: "pro", x_cabin_set_altitude: "pro",
  x_cabin_detect_decompression: "pro", x_engine_add: "pro", x_engine_check_health: "pro",
  x_v2x_connect: "pro", x_v2x_send_v2v: "pro", x_v2x_send_v2i: "pro",
  x_pedestrian_add: "pro", x_pedestrian_predict: "pro", x_pedestrian_risk: "pro",
  x_traffic_set_signal: "pro", x_traffic_should_proceed: "pro", x_traffic_recommended_speed: "pro",
  x_dms_update: "pro", x_dms_get_alertness: "pro", x_dms_get_fatigue: "pro",
  x_road_update_friction: "pro", x_road_detect_hazard: "pro", x_road_get_recommendation: "pro",
  x_collision_calc_ttc: "pro", x_collision_should_brake: "pro", x_collision_should_evade: "pro",
  x_geofence_add_zone: "pro", x_geofence_check: "pro", x_geofence_violations: "pro",
  x_wind_update_imu: "pro", x_wind_update_gps: "pro", x_wind_get_vector: "pro",
  x_obstacle_add_3d: "pro", x_obstacle_get_avoidance: "pro", x_obstacle_find_path: "pro",
  x_swarm_add_drone: "pro", x_swarm_consensus: "pro", x_swarm_leader_election: "pro",
  x_delivery_create: "pro", x_delivery_assign: "pro", x_delivery_track: "pro",
  x_spray_set_field: "pro", x_spray_plan_swath: "pro", x_spray_get_coverage: "pro",
  x_sar_set_area: "pro", x_sar_plan_grid: "pro", x_sar_plan_spiral: "pro",
  x_rotor_set_collective: "pro", x_rotor_set_cyclic: "pro", x_rotor_set_pedal: "pro",
  x_rotor_get_rpm: "pro", x_rotor_health: "pro", x_hover_set_target: "pro",
  x_hover_get_error: "pro", x_hover_correction: "pro", x_load_attach: "pro",
  x_load_detach: "pro", x_load_compensate: "pro", x_auto_detect_power_loss: "pro",
  x_auto_initiate: "pro", x_auto_maintain: "pro", x_heli_weather_get_correction: "pro",
  x_heli_weather_get_crosswind: "pro", x_vtol_plan_takeoff: "pro", x_vtol_plan_landing: "pro",
  x_vtol_energy: "pro",
  x_vision_detect: "pro", x_nlp_analyze: "pro", x_predict_add: "pro",
  x_classify_add: "pro", x_anomaly_add: "pro", x_rl_create_state: "pro",
  x_failsafe_add_rule: "pro", x_watchdog_start: "pro", x_emergency_activate: "pro",
  x_redundancy_add: "pro", x_fmea_add: "pro", x_interlock_add: "pro", x_breaker_add: "pro",
  x_reason_add_fact: "pro", x_causal_add_link: "pro", x_world_add_object: "pro",
  x_context_set: "pro", x_analogy_add: "pro", x_spatial_add_obj: "pro",
  x_ethics_add_principle: "pro", x_bias_add_dataset: "pro", x_fairness_add_model: "pro",
  x_transparency_add: "pro", x_safety_validate: "pro",
  x_idea_add_concept: "pro", x_innovation_add_tech: "pro", x_design_create_project: "pro",
  x_pattern_add: "pro", x_relax_add_problem: "pro",
  // MAX tools
  site_create: "max", site_publish: "max", site_unpublish: "max",
  site_domain: "max", site_preview: "max", media_fetch: "max",
  svg_generate: "max", github_connect: "max", external_directory: "max",
  x_launch_calc_window: "max", x_launch_get_next: "max", x_launch_check_constraints: "max",
  x_ground_station_add: "max", x_ground_station_schedule: "max", x_ground_station_next_pass: "max",
  x_stage_separate: "max", x_stage_deploy_chutes: "max", x_stage_touchdown: "max",
  x_payload_create: "max", x_payload_deploy: "max", x_payload_confirm: "max",
  x_deorbit_calc_burn: "max", x_deorbit_get_window: "max",
  x_constellation_add_sat: "max", x_constellation_coverage: "max", x_constellation_revisit: "max",
  x_eclipse_predict: "max", x_eclipse_power_budget: "max",
  x_thermal_monitor: "max", x_thermal_check_limits: "max", x_thermal_predict_flux: "max",
  x_medical_update_vitals: "max", x_medical_get_vitals: "max", x_medical_check_alerts: "max",
  x_drug_add_medication: "max", x_drug_check_interactions: "max", x_drug_get_contraindications: "max",
  x_patient_set: "max", x_patient_update_vitals: "max", x_patient_get_alert_level: "max",
  x_plc_connect: "max", x_plc_read_register: "max", x_plc_write_register: "max",
  x_scada_add_sensor: "max", x_scada_update_value: "max", x_scada_check_limits: "max",
  x_cnc_load_program: "max", x_cnc_start: "max", x_cnc_stop: "max", x_cnc_get_status: "max",
  x_robot_set_joint: "max", x_robot_move_linear: "max", x_robot_get_kinematics: "max",
  x_conveyor_start: "max", x_conveyor_stop: "max",
  x_power_add_generator: "max", x_power_add_load: "max", x_power_get_balance: "max",
  x_water_set_flow: "max", x_water_set_ph: "max", x_water_get_quality: "max",
  x_hvac_set_temp: "max", x_hvac_set_humidity: "max", x_hvac_get_efficiency: "max",
  x_fire_detect_smoke: "max", x_fire_detect_heat: "max", x_fire_activate: "max",
  x_rail_set_signal: "max", x_rail_set_speed: "max", x_rail_emergency_stop: "max",
  x_surveillance_add_camera: "max", x_surveillance_detect_motion: "max", x_surveillance_set_recording: "max",
  x_access_grant: "max", x_access_revoke: "max", x_access_check: "max",
  x_intrusion_set_zone: "max", x_intrusion_arm: "max", x_intrusion_check_breach: "max",
  x_cyber_detect_port_scan: "max", x_cyber_detect_brute_force: "max", x_cyber_block_ip: "max",
  x_encrypt_data: "max", x_decrypt_data: "max", x_encrypt_hash: "max",
  x_lidar_add_point: "max", x_lidar_downsample: "max", x_lidar_get_volume: "max",
  x_rtk_set_position: "max", x_rtk_get_accuracy: "max", x_rtk_get_fix: "max",
  x_total_station_measure_distance: "max", x_total_station_measure_angle: "max",
  x_mapper_set_flight: "max", x_mapper_add_photo: "max", x_mapper_generate_model: "max",
  x_seismic_add_sensor: "max", x_seismic_detect_pwave: "max", x_seismic_get_magnitude: "max",
  x_soil_add_sample: "max", x_soil_get_recommendation: "max", x_soil_get_heatmap: "max",
  x_crop_add_field: "max", x_crop_update_growth: "max", x_crop_predict_yield: "max",
  x_irrigation_set_zone: "max", x_irrigation_start: "max", x_irrigation_get_usage: "max",
  x_pest_add_observation: "max", x_pest_get_risk: "max", x_pest_get_recommendation: "max",
  x_harvest_set_field: "max", x_harvest_plan_schedule: "max", x_harvest_get_optimal_date: "max",
  x_sonar_add_target: "max", x_sonar_get_targets: "max", x_sonar_classify: "max",
  x_nav_chart_add_waypoint: "max", x_nav_chart_set_route: "max", x_nav_chart_get_eta: "max",
  x_hull_add_sensor: "max", x_hull_check_integrity: "max", x_hull_detect_leak: "max",
  x_anchor_calculate_scope: "max", x_anchor_drop: "max", x_anchor_retrieve: "max",
  x_ballast_add_tank: "max", x_ballast_fill: "max", x_ballast_get_stability: "max",
  x_excavator_set_arm: "max", x_excavator_set_bucket: "max", x_excavator_dig: "max",
  x_crane_set_boom: "max", x_crane_set_trolley: "max", x_crane_check_wind: "max",
  x_concrete_set_ratio: "max", x_concrete_start_mix: "max", x_concrete_get_consistency: "max",
  x_construction_drone_set_site: "max", x_construction_drone_capture: "max", x_construction_drone_get_model: "max",
  x_bulldozer_set_blade: "max", x_bulldozer_push: "max", x_bulldozer_get_grade: "max",
  x_arduino_connect: "max", x_arduino_digital_write: "max", x_arduino_analog_read: "max",
  x_rpi_connect: "max", x_rpi_gpio_read: "max",
  x_can_connect: "max", x_can_send: "max", x_i2c_read: "max",
  x_lidar_connect: "max", x_lidar_get_pointcloud: "max",
  x_camera_connect: "max", x_radar_connect: "max",
  x_imu_connect: "max", x_imu_get_accel: "max",
  x_ultrasonic_connect: "max", x_thermal_connect: "max",
  x_sdr_connect: "max", x_sdr_get_fft: "max",
  x_wifi_scan: "max", x_bt_scan: "max", x_lora_connect: "max", x_gps_connect: "max", x_signal_analyze: "max",
  x_twin_create: "max", x_physics_add_body: "max", x_scenario_create: "max",
  x_sync_add_source: "max", x_sim_add_task: "max",
  x_dash_create_panel: "max", x_chart_create: "max", x_status_add: "max",
  x_stream_create: "max", x_widget_create: "max",
  x_alert_create: "max", x_notify_add_channel: "max", x_escalation_create: "max", x_anomaly_alert_add: "max",
  x_tsdb_create: "max", x_event_log: "max", x_audit_record: "max", x_export_csv: "max", x_storage_allocate: "max",
  x_ws_start: "max", x_rest_add_route: "max", x_auth_add_client: "max",
  x_remote_connect: "max", x_cmd_register: "max", x_heartbeat_start: "max",
  x_failure_add: "max", x_maint_add_task: "max", x_spare_add: "max",
  x_vibration_add: "max", x_oil_add: "max", x_thermal_trend_add: "max",
  x_decision_add_option: "max", x_scenario_analyze: "max", x_risk_add: "max",
  x_tradeoff_add: "max", x_tree_create: "max", x_causal_add_var: "max",
  x_rbac_add_role: "max", x_auth_add_user: "max", x_policy_add: "max",
  x_access_log: "max", x_token_create: "max", x_cert_generate: "max",
  x_rb_register: "max", x_rb_control: "max", x_rb_states: "max",
  x_rb_scene_create: "max", x_rb_scene_activate: "max",
  x_oc_create: "max", x_oc_templates: "max", x_oc_projects: "max",
  x_tm_timeline: "max", x_tm_snapshot: "max", x_tm_evolution: "max",
  x_tm_predict: "max", x_tm_bugs: "max",
  x_ct_register: "max", x_ct_transfer: "max", x_ct_collab: "max", x_ct_agents: "max",
  x_se_analyze: "max", x_se_suggest: "max", x_se_trend: "max",
  x_ea_analyze: "max", x_ea_adapt: "max", x_ea_mood: "max",
  x_mp_store: "max", x_mp_query: "max", x_mp_stats: "max", x_mp_connect: "max",
  x_rs_simulate: "max", x_rs_results: "max",
  // ULTRA tools
  ultra_codegen: "ultra", ultra_security_sweep: "ultra", ultra_performance: "ultra",
  ultra_refactor: "ultra", ultra_test_gen: "ultra", ultra_autodeploy: "ultra",
  ultra_code_review: "ultra", ultra_quantum: "ultra",
  x_singularity_process: "ultra", x_singularity_heal: "ultra", x_singularity_learn: "ultra",
  x_singularity_state: "ultra", x_singularity_evolution: "ultra",
  x_guardian_scan: "ultra", x_guardian_context: "ultra", x_guardian_status: "ultra", x_guardian_clear: "ultra",
  // Subscription — always free (AI needs to check tier)
  x_subscription_status: "free",
  // Extended Chemistry (missing)
  x_chem_limiting_reagent: "pro", x_chem_percent_composition: "pro",
  x_acid_ph_strong: "pro", x_acid_ph_weak: "pro", x_acid_titration: "pro",
  // Extended Biology (missing)
  x_bio_shannon_index: "pro", x_bio_simpson_index: "pro",
  x_bio_michaelis_menten: "max", x_bio_hill_equation: "max",
  // Extended Engineering (missing)
  x_eng_mohrs_circle: "pro", x_eng_flow_rate: "pro", x_eng_pipe_flow: "pro", x_eng_concrete_mix: "pro",
  x_eng_torsion: "pro", x_eng_thermal_stress: "max", x_eng_heat_exchanger: "max",
  x_eng_filter_design: "pro", x_eng_power_factor: "pro",
  // Extended Finance (missing)
  x_fin_annuity: "pro", x_fin_dividend_discount: "pro", x_fin_beta: "pro",
  // Extended Data Science (missing)
  x_ds_standardize: "pro", x_ds_gradient_descent: "max", x_ds_confusion_matrix: "pro",
  x_ds_tfidf: "pro", x_ds_monte_carlo: "max", x_ds_multi_regression: "max",
  // Extended Security (missing)
  x_sec_firewall: "max", x_sec_malware_sig: "max", x_sec_port_scan: "max",
  // Extended Daily Life (missing)
  x_life_savings_goal: "free", x_life_pace: "free", x_life_aspect_ratio: "free",
  x_life_color: "free", x_life_pixel_rem: "free", x_life_wind_chill: "free",
  // Vehicle tools
  x_veh_drone_connect: "max", x_veh_drone_arm: "max", x_veh_drone_disarm: "max",
  x_veh_drone_takeoff: "max", x_veh_drone_land: "max", x_veh_drone_rtl: "max",
  x_veh_drone_mode: "max", x_veh_drone_speed: "max", x_veh_drone_fly_to: "max",
  x_veh_drone_waypoints: "max", x_veh_drone_attitude: "max", x_veh_drone_geofence: "max",
  x_veh_drone_emergency: "max",
  x_veh_car_connect: "max", x_veh_car_rpm: "max", x_veh_car_speed: "max",
  x_veh_car_fuel: "max", x_veh_car_dtcs: "max", x_veh_car_clear_dtcs: "max",
  x_veh_car_lock: "max", x_veh_car_unlock: "max", x_veh_car_lights: "max",
  x_veh_car_horn: "max", x_veh_car_start: "max", x_veh_car_stop: "max",
  x_veh_car_climate: "max",
  x_veh_boat_connect: "max", x_veh_boat_heading: "max", x_veh_boat_throttle: "max",
  x_veh_boat_navigate: "max", x_veh_boat_emergency: "max",
  x_veh_rocket_connect: "ultra", x_veh_rocket_countdown: "ultra", x_veh_rocket_launch: "ultra",
  x_veh_rocket_trajectory: "ultra", x_veh_rocket_stage: "ultra", x_veh_rocket_fairing: "ultra",
  x_veh_rocket_payload: "ultra", x_veh_rocket_abort: "ultra", x_veh_rocket_throttle: "ultra",
  x_veh_rocket_engine: "ultra",
  x_veh_sat_connect: "ultra", x_veh_sat_attitude: "ultra", x_veh_sat_thruster: "ultra",
  x_veh_sat_orbit: "ultra", x_veh_sat_solar: "ultra", x_veh_sat_antenna: "ultra",
  x_veh_sat_camera: "ultra", x_veh_sat_safemode: "ultra", x_veh_sat_deorbit: "ultra",
  x_veh_fleet_create_drone: "max", x_veh_fleet_create_car: "max", x_veh_fleet_create_rocket: "ultra",
  x_veh_fleet_telemetry: "max", x_veh_fleet_emergency_stop: "max", x_veh_fleet_disconnect: "max",
  // Universal Command Engine
  x_uce_process: "max", x_uce_devices: "max", x_uce_history: "max",
  x_uce_context: "max", x_uce_register_device: "max",

  // Extended Domain Tools V2 — Astronomy
  x_astro_orbital_period: "free", x_astro_gravity: "free", x_astro_escape_vel: "free",
  x_astro_luminosity: "free", x_astro_parallax: "free", x_astro_angular_sep: "free",
  x_astro_redshift: "free", x_astro_habitable_zone: "free", x_astro_julian_date: "free",
  x_astro_sidereal_time: "free",
  // Geology
  x_geo_mohs: "free", x_geo_seismic_density: "free", x_geo_radiometric: "free",
  x_geo_rock_type: "free", x_geo_bearing: "pro", x_geo_porosity: "free",
  x_geo_permeability: "free", x_geo_geothermal: "free", x_geo_erosion: "pro",
  x_geo_plate_velocity: "free",
  // Meteorology
  x_meteo_heat_index: "free", x_meteo_wind_chill: "free", x_meteo_dew_point: "free",
  x_meteo_pressure_alt: "free", x_meteo_cloud_base: "free", x_meteo_visibility: "free",
  x_meteo_pet: "pro", x_meteo_mixing_ratio: "free", x_meteo_virtual_temp: "free",
  x_meteo_stability: "free",
  // Oceanography
  x_ocean_density: "free", x_ocean_sound_speed: "free", x_ocean_tidal: "free",
  x_ocean_wave_period: "free", x_ocean_wave_speed: "free", x_ocean_ekman: "pro",
  x_ocean_chlorophyll: "free", x_ocean_mixed_layer: "pro", x_ocean_coriolis: "free",
  x_ocean_rossby: "pro",
  // Materials Science
  x_mat_youngs: "free", x_mat_shear: "free", x_mat_bulk: "free",
  x_mat_thermal_expansion: "free", x_mat_thermal_stress: "free", x_mat_brinell: "free",
  x_mat_fatigue: "pro", x_mat_creep: "pro", x_mat_fracture: "pro",
  x_mat_composite: "free",
  // Linguistics
  x_ling_entropy: "free", x_ling_ttr: "free", x_ling_flesch: "free",
  x_ling_syllables: "free", x_ling_edit_distance: "free", x_ling_ngrams: "free",
  x_ling_tfidf_sim: "free", x_ling_zipf: "free", x_ling_pos: "free",
  x_ling_morphemes: "free",
  // Music Theory
  x_music_note_freq: "free", x_music_freq_note: "free", x_music_interval: "free",
  x_music_chord: "free", x_music_tempo_ms: "free", x_music_duration_bpm: "free",
  x_music_scale: "free", x_music_beat_freq: "free", x_music_doppler: "free",
  x_music_tuning_table: "free",
  // Game Mechanics
  x_game_expected_dmg: "free", x_game_dps: "free", x_game_ttk: "free",
  x_game_loot_chance: "free", x_game_expected_loot: "free", x_game_xp_for_level: "free",
  x_game_total_xp: "free", x_game_armor_reduction: "free", x_game_cooldown: "free",
  x_game_move_speed: "free",
  // Blockchain
  x_chain_sha256: "pro", x_chain_difficulty: "pro", x_chain_adjust_diff: "pro",
  x_chain_block_reward: "pro", x_chain_tx_fee: "pro", x_chain_merkle: "pro",
  x_chain_gas: "pro", x_chain_staking: "pro", x_chain_impermanent_loss: "pro",
  x_chain_nonce: "pro",
  // Networking
  x_net_cidr_mask: "free", x_net_mask_cidr: "free", x_net_usable_hosts: "free",
  x_net_bdp: "free", x_net_tcp_throughput: "free", x_net_ip_int: "free",
  x_net_int_ip: "free", x_net_network_addr: "free", x_net_broadcast: "free",
  x_net_jitter: "free",
  // DevOps
  x_devops_deploy_rate: "free", x_devops_mtbf: "free", x_devops_mttr: "free",
  x_devops_availability: "free", x_devops_sla: "free", x_devops_container_eff: "free",
  x_devops_pipeline: "free", x_devops_error_rate: "free", x_devops_infra_cost: "free",
  x_devops_scaling: "free",
  // Database
  x_db_complexity: "free", x_db_selectivity: "free", x_db_buffer_pool: "free",
  x_db_bloat: "free", x_db_pool_size: "free", x_db_exec_time: "free",
  x_db_replication: "free", x_db_sharding: "pro", x_db_vacuum: "free",
  x_db_throughput: "free",
  // === Missing tools from original registry (104 tools) ===
  // Biology
  x_bio_dna_rna: "free", x_bio_gc_content: "free", x_bio_hardy_weinberg: "free",
  x_bio_population: "free", x_bio_punnett: "free",
  // Captcha
  x_captcha_click: "pro", x_captcha_detect: "pro", x_captcha_input: "pro",
  x_captcha_solve_image: "pro",
  // Chemistry
  x_chem_buffer: "free", x_chem_dilution: "free", x_chem_electrochemistry: "pro",
  x_chem_gas_laws: "free", x_chem_halflife: "free", x_chem_molar_mass: "free",
  x_chem_moles: "free", x_chem_nernst: "pro",
  // Documents
  x_doc_count_words: "free", x_doc_create: "free", x_doc_edit: "free",
  x_doc_markdown_to_html: "free", x_doc_read: "free",
  // Data Science
  x_ds_cosine: "free", x_ds_distance: "free", x_ds_entropy: "free",
  x_ds_gini: "free", x_ds_kmeans: "max", x_ds_normalize: "free",
  x_ds_sigmoid: "free", x_ds_softmax: "free",
  // Engineering
  x_eng_battery: "free", x_eng_beam: "free", x_eng_buckling: "pro",
  x_eng_gear: "free", x_eng_impedance: "free", x_eng_motor: "free",
  x_eng_resonance: "free", x_eng_reynolds: "free", x_eng_stress: "free",
  x_eng_three_phase: "pro", x_eng_transformer: "free", x_eng_vibration: "free",
  // Finance
  x_fin_black_scholes: "pro", x_fin_bond: "pro", x_fin_compound: "free",
  x_fin_irr: "pro", x_fin_mortgage: "free", x_fin_npv: "pro",
  x_fin_present_value: "free", x_fin_roi: "free", x_fin_sharpe: "pro",
  x_fin_stock: "pro",
  // Daily Life
  x_life_age: "free", x_life_bmi: "free", x_life_calories: "free",
  x_life_date_diff: "free", x_life_emi: "free", x_life_fuel: "free",
  x_life_gst: "free", x_life_heart_rate: "free", x_life_temp: "free",
  x_life_text_stats: "free", x_life_tip: "free", x_life_unit: "free",
  x_life_wpm: "free",
  // Mathematics
  x_math_combinatorics: "free", x_math_derivative: "free", x_math_geometry: "free",
  x_math_gradient: "free", x_math_integral: "free", x_math_matrix: "free",
  x_math_prime: "free", x_math_stats: "free",
  // Memory
  x_memory_append: "free", x_memory_create: "free", x_memory_delete: "free",
  x_memory_read: "free", x_memory_search: "free", x_memory_update: "free",
  x_memory_view: "free",
  // Physics
  x_physics_em: "free", x_physics_mechanics: "free", x_physics_relativity: "free",
  x_physics_thermo: "free", x_physics_waves: "free",
  // Security
  x_sec_caesar: "free", x_sec_cve: "pro", x_sec_entropy: "free",
  x_sec_hash_id: "free", x_sec_password: "free", x_sec_ssl: "pro",
  x_sec_subnet: "free", x_sec_xor: "free",
  // Skill
  x_skill_create: "free", x_skill_delete: "free", x_skill_list: "free",
  // Task
  x_task_create: "free", x_task_delete: "free", x_task_list: "free",
  x_task_run_now: "free", x_task_scheduler_status: "free",
  x_task_start_scheduler: "free", x_task_toggle: "free",
  // Quantum Computing
  x_quantum_rx_gate: "pro", x_quantum_hadamard: "pro", x_quantum_cnot: "pro",
  x_quantum_entropy: "pro", x_quantum_fidelity: "pro", x_quantum_bloch: "pro",
  x_quantum_decomposition: "pro", x_quantum_concurrence: "pro", x_quantum_shor_period: "ultra",
  x_quantum_circuit_depth: "pro",
  // Robotics
  x_robot_fwd_kinematics: "free", x_robot_inv_kinematics: "free", x_robot_pid: "free",
  x_robot_workspace: "free", x_robot_jacobian: "pro", x_robot_manipulability: "pro",
  x_robot_dynamics: "pro", x_robot_heuristic: "free", x_robot_sensor_fusion: "free",
  x_robot_pose_error: "free",
  // Nuphus MCP fallback (19)
  nuphus_browser_click: "free", nuphus_browser_cookies: "free", nuphus_browser_execute: "free",
  nuphus_browser_navigate: "free", nuphus_browser_screenshot: "free", nuphus_browser_snapshot: "free",
  nuphus_browser_type: "free", nuphus_click: "free", nuphus_clipboard_get: "free",
  nuphus_clipboard_set: "free", nuphus_drag: "free", nuphus_focus_window: "free",
  nuphus_hotkey: "free", nuphus_list_windows: "free", nuphus_mouse_move: "free",
  nuphus_ocr: "free", nuphus_screenshot: "free", nuphus_scroll: "free",
  nuphus_type: "free",
  // Touchpoint MCP fallback (47)
  tp_action: "free", tp_activate_window: "free", tp_apps: "free",
  tp_chrome_profiles: "free", tp_click: "free", tp_click_at: "free",
  tp_close_tab: "free", tp_close_window: "free", tp_configure: "free",
  tp_diagnostics: "free", tp_double_click: "free", tp_double_click_at: "free",
  tp_drag: "free", tp_element_at: "free", tp_elements: "free",
  tp_find: "free", tp_find_window: "free", tp_focus: "free",
  tp_fullscreen_window: "free", tp_get_element: "free", tp_hotkey: "free",
  tp_list_tabs: "free", tp_minimize_window: "free", tp_monitor_count: "free",
  tp_mouse_move: "free", tp_move_window: "free", tp_new_tab: "free",
  tp_open_chrome_profile: "free", tp_press_key: "free", tp_read_text: "free",
  tp_resize_window: "free", tp_right_click: "free", tp_right_click_at: "free",
  tp_screenshot: "free", tp_screenshot_window: "free", tp_scroll: "free",
  tp_select_text: "free", tp_select_text_range: "free", tp_set_numeric_value: "free",
  tp_set_value: "free", tp_snapshot: "free", tp_switch_tab: "free",
  tp_type_text: "free", tp_wait_for: "free", tp_wait_for_app: "free",
  tp_wait_for_window: "free", tp_windows: "free",
  // Advanced tools (20)
  x_cdp_connect: "pro", x_cdp_disconnect: "pro",
  x_comp_click_at: "pro", x_comp_drag: "pro", x_comp_key_press: "pro",
  x_comp_list_windows: "pro", x_comp_move_mouse: "pro", x_comp_open_app: "pro",
  x_comp_screenshot: "pro", x_comp_scroll: "pro", x_comp_type_text: "pro",
  x_plan_create: "pro", x_plan_execute: "pro", x_plan_status: "pro",
  x_media_data_extract: "pro", x_media_image_edit: "pro", x_media_ocr: "pro",
  x_media_video_process: "pro",
  x_behavior_rules: "ultra", x_learn_from_task: "ultra",
}

// Lazy-loaded registry helper — call this instead of xToolRegistry for deferred initialization
let _xToolRegistryCache: XToolDef[] | null = null
export function getXToolRegistry(): XToolDef[] {
  if (_xToolRegistryCache) return _xToolRegistryCache
  _xToolRegistryCache = xToolRegistry
  return _xToolRegistryCache
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
  { id: "x_mp_store", name: "Memory Palace Store", description: "Store a memory in the infinite palace", parameters: { type: { type: "string", description: "Type: conversation|code_change|decision|fact|person|project|emotion|skill", required: true }, content: { type: "any", required: true }, tags: { type: "array" }, importance: { type: "number" } }, category: "ultra-x", execute: async (a) => { const { MemoryPalace } = await import("./memory-palace"); return { ok: true, data: await new MemoryPalace().store(a.type, a.content, a.tags, a.importance) } } },
  { id: "x_mp_query", name: "Memory Palace Query", description: "Query the infinite memory palace", parameters: { text: { type: "string" }, type: { type: "string" }, tags: { type: "array" }, minImportance: { type: "number" }, limit: { type: "number" } }, category: "ultra-x", execute: async (a) => { const { MemoryPalace } = await import("./memory-palace"); return { ok: true, data: await new MemoryPalace().query(a) } } },
  { id: "x_mp_stats", name: "Memory Palace Stats", description: "Get memory palace statistics", parameters: {}, category: "ultra-x", execute: async () => { const { MemoryPalace } = await import("./memory-palace"); return { ok: true, data: await new MemoryPalace().getStats() } } },
  { id: "x_mp_connect", name: "Memory Palace Connect", description: "Connect two memories", parameters: { id1: { type: "string", required: true }, id2: { type: "string", required: true } }, category: "ultra-x", execute: async (a) => { const { MemoryPalace } = await import("./memory-palace"); await new MemoryPalace().connect(a.id1, a.id2); return { ok: true } } },

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

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTENDED MATHEMATICS TOOLS (15 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_math_matrix", name: "Matrix Operations", description: "Add, multiply, transpose, determinant, inverse, rank of matrices", parameters: { operation: { type: "string", description: "add|multiply|transpose|determinant|inverse|rank", required: true }, matrixA: { type: "string", description: "JSON 2D array", required: true }, matrixB: { type: "string", description: "JSON 2D array (for binary ops)" } }, category: "mathematics", execute: async (a) => { const A = new MatrixOperations(JSON.parse(a.matrixA)); if (a.operation === "determinant") return A.determinant(); if (a.operation === "inverse") return A.inverse(); if (a.operation === "rank") return A.rank(); if (a.operation === "transpose") return { ok: true, data: A.transpose() }; if (a.matrixB) { const B = new MatrixOperations(JSON.parse(a.matrixB)); if (a.operation === "add") return A.add(B); if (a.operation === "multiply") return A.multiply(B); } return { ok: false, error: "Invalid operation" }; } },
  { id: "x_math_derivative", name: "Derivative Calculator", description: "Numerical derivative of a function at a point", parameters: { functionStr: { type: "string", description: "JS function expression like 'x => x**2 + 3*x'", required: true }, x: { type: "number", required: true } }, category: "mathematics", execute: async (a) => { const f = new Function("return " + a.functionStr)(); return CalculusEngine.derivative(f, a.x); } },
  { id: "x_math_integral", name: "Integral Calculator", description: "Numerical definite integral (Simpson's rule)", parameters: { functionStr: { type: "string", required: true }, a: { type: "number", description: "Lower bound", required: true }, b: { type: "number", description: "Upper bound", required: true } }, category: "mathematics", execute: async (a) => { const f = new Function("return " + a.functionStr)(); return CalculusEngine.integral(f, a.a, a.b); } },
  { id: "x_math_gradient", name: "Gradient Calculator", description: "Gradient vector and magnitude of a 2-variable function", parameters: { functionStr: { type: "string", required: true }, x: { type: "number", required: true }, y: { type: "number", required: true } }, category: "mathematics", execute: async (a) => { const f = new Function("return " + a.functionStr)(); return CalculusEngine.gradient(f, a.x, a.y); } },
  { id: "x_math_stats", name: "Statistics Calculator", description: "Mean, median, mode, variance, std dev, correlation, linear regression", parameters: { operation: { type: "string", description: "mean|median|mode|variance|stddev|correlation|regression", required: true }, dataA: { type: "string", description: "JSON array of numbers", required: true }, dataB: { type: "string", description: "JSON array (for correlation/regression)" } }, category: "mathematics", execute: async (a) => { const arr = JSON.parse(a.dataA); const S = StatisticsEngine; switch (a.operation) { case "mean": return S.mean(arr); case "median": return S.median(arr); case "mode": return S.mode(arr); case "variance": return S.variance(arr); case "stddev": return S.stdDev(arr); case "correlation": return S.correlation(arr, JSON.parse(a.dataB)); case "regression": return S.linearRegression(arr, JSON.parse(a.dataB)); default: return { ok: false, error: "Invalid operation" }; } } },
  { id: "x_math_prime", name: "Prime Number Tools", description: "Check primality, prime factorization, GCD, LCM", parameters: { operation: { type: "string", description: "isPrime|factorize|gcd|lcm|fibonacci|collatz|totient|perfect", required: true }, n: { type: "number", required: true }, n2: { type: "number", description: "Second number for gcd/lcm" } }, category: "mathematics", execute: async (a) => { const NT = NumberTheory; switch (a.operation) { case "isPrime": return NT.isPrime(a.n); case "factorize": return NT.primeFactorization(a.n); case "gcd": return NT.gcd(a.n, a.n2 || 0); case "lcm": return NT.lcm(a.n, a.n2 || 1); case "fibonacci": return NT.fibonacci(a.n); case "collatz": return NT.collatzSequence(a.n); case "totient": return NT.eulerTotient(a.n); case "perfect": return NT.isPerfectNumber(a.n); default: return { ok: false, error: "Invalid operation" }; } } },
  { id: "x_math_geometry", name: "Geometry Calculator", description: "Triangle area, circle area, polygon area, sphere volume, distance", parameters: { operation: { type: "string", description: "triangle|circle|polygon|sphere|cylinder|distance", required: true }, params: { type: "string", description: "JSON params like {a:3,b:4,c:5}", required: true } }, category: "mathematics", execute: async (a) => { const p = JSON.parse(a.params); const G = GeometryEngine; switch (a.operation) { case "triangle": return G.triangleArea(p.a, p.b, p.c); case "circle": return G.circleArea(p.radius); case "polygon": return G.polygonArea(p.sides, p.sideLength); case "sphere": return G.sphereVolume(p.radius); case "cylinder": return G.cylinderVolume(p.radius, p.height); case "distance": return G.distance3D(p.x1, p.y1, p.z1, p.x2, p.y2, p.z2); default: return { ok: false, error: "Invalid operation" }; } } },
  { id: "x_math_combinatorics", name: "Combinatorics Calculator", description: "Permutation, combination, Catalan number, partitions", parameters: { operation: { type: "string", description: "permutation|combination|catalan|partitions", required: true }, n: { type: "number", required: true }, r: { type: "number" } }, category: "mathematics", execute: async (a) => { const C = CombinatoricsEngine; switch (a.operation) { case "permutation": return C.permutation(a.n, a.r || 0); case "combination": return C.combination(a.n, a.r || 0); case "catalan": return C.catalanNumber(a.n); case "partitions": return C.partitions(a.n); default: return { ok: false, error: "Invalid operation" }; } } },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTENDED PHYSICS TOOLS (12 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_physics_mechanics", name: "Classical Mechanics", description: "Force, energy, momentum, projectile motion, pendulum, friction", parameters: { operation: { type: "string", description: "force|kineticEnergy|potentialEnergy|momentum|projectile|pendulum|spring|work|power|friction", required: true }, params: { type: "string", description: "JSON params", required: true } }, category: "physics", execute: async (a) => { const p = JSON.parse(a.params); const M = ClassicalMechanics; switch (a.operation) { case "force": return M.force(p.mass, p.acceleration); case "kineticEnergy": return M.kineticEnergy(p.mass, p.velocity); case "potentialEnergy": return M.potentialEnergy(p.mass, p.g || 9.81, p.height); case "momentum": return M.momentum(p.mass, p.velocity); case "projectile": return M.projectileMotion(p.v0, p.angle, p.g); case "pendulum": return M.simplePendulum(p.length, p.g); case "spring": return M.springForce(p.k, p.displacement); case "work": return M.work(p.force, p.distance, p.angle); case "power": return M.power(p.force, p.velocity); case "friction": return M.friction(p.normalForce, p.coefficient); default: return { ok: false, error: "Invalid operation" }; } } },
  { id: "x_physics_thermo", name: "Thermodynamics Calculator", description: "Ideal gas law, heat transfer, entropy, Carnot efficiency, thermal expansion", parameters: { operation: { type: "string", description: "idealGas|heatTransfer|entropy|carnot|expansion|conduction|adiabatic", required: true }, params: { type: "string", required: true } }, category: "physics", execute: async (a) => { const p = JSON.parse(a.params); const T = Thermodynamics; switch (a.operation) { case "idealGas": return T.idealGasLaw(p.P || 0, p.V || 0, p.T || 0, p.n || 0); case "heatTransfer": return T.heatTransfer(p.m, p.c, p.deltaT); case "entropy": return T.entropyChange(p.Q, p.T); case "carnot": return T.carnotEfficiency(p.T_hot, p.T_cold); case "expansion": return T.thermalExpansion(p.length, p.alpha, p.deltaT); case "conduction": return T.heatConduction(p.k, p.A, p.dT, p.thickness); case "adiabatic": return T.adiabaticProcess(p.gamma, p.P1, p.V1, p.V2); default: return { ok: false }; } } },
  { id: "x_physics_em", name: "Electromagnetism Calculator", description: "Coulomb force, electric field, capacitor, Ohm's law, resistance, wave speed", parameters: { operation: { type: "string", description: "coulomb|electricField|capacitor|ohmsLaw|resistance|waveSpeed|magneticForce|inductor", required: true }, params: { type: "string", required: true } }, category: "physics", execute: async (a) => { const p = JSON.parse(a.params); const EM = Electromagnetism; switch (a.operation) { case "coulomb": return EM.coulombForce(p.q1, p.q2, p.r); case "electricField": return EM.electricField(p.q, p.r); case "capacitor": return EM.capacitor(p.C, p.V); case "ohmsLaw": return EM.ohmsLaw(p.V || 0, p.I || 0, p.R || 0); case "resistance": return EM.resistance(p.rho, p.L, p.A); case "waveSpeed": return EM.waveSpeed(p.wavelength, p.frequency); case "magneticForce": return EM.magneticForce(p.q, p.v, p.B, p.theta); case "inductor": return EM.inductor(p.L, p.dIdt); default: return { ok: false }; } } },
  { id: "x_physics_relativity", name: "Relativity Calculator", description: "Time dilation, length contraction, relativistic energy, mass-energy equivalence", parameters: { operation: { type: "string", description: "timeDilation|lengthContraction|relativisticEnergy|massEnergy", required: true }, params: { type: "string", required: true } }, category: "physics", execute: async (a) => { const p = JSON.parse(a.params); const R2 = Relativity; switch (a.operation) { case "timeDilation": return R2.timeDilation(p.t, p.v); case "lengthContraction": return R2.lengthContraction(p.L, p.v); case "relativisticEnergy": return R2.relativisticEnergy(p.m, p.v); case "massEnergy": return R2.massEnergyEquivalence(p.m); default: return { ok: false }; } } },
  { id: "x_physics_waves", name: "Wave Mechanics Calculator", description: "Standing waves, Doppler effect, beats, wave interference", parameters: { operation: { type: "string", description: "standingWave|doppler|beats|interference", required: true }, params: { type: "string", required: true } }, category: "physics", execute: async (a) => { const p = JSON.parse(a.params); const W = WaveMechanics; switch (a.operation) { case "standingWave": return W.standingWave(p.n, p.L); case "doppler": return W.dopplerEffect(p.f0, p.vs, p.vr, p.v); case "beats": return W.beats(p.f1, p.f2); case "interference": return W.waveInterference(p.a1, p.phi1, p.a2, p.phi2); default: return { ok: false }; } } },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTENDED CHEMISTRY TOOLS (8 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_chem_molar_mass", name: "Molar Mass Calculator", description: "Calculate molar mass from chemical formula", parameters: { formula: { type: "string", description: "Chemical formula like H2O, NaCl", required: true } }, category: "chemistry", execute: async (a) => Stoichiometry.molarMass(a.formula) },
  { id: "x_chem_moles", name: "Moles Calculator", description: "Calculate moles and molecules from mass", parameters: { mass: { type: "number", required: true }, molarMass: { type: "number", required: true } }, category: "chemistry", execute: async (a) => Stoichiometry.moles(a.mass, a.molarMass) },
  { id: "x_chem_dilution", name: "Dilution Calculator", description: "Calculate dilution (C1V1 = C2V2)", parameters: { C1: { type: "number", required: true }, V1: { type: "number", required: true }, C2: { type: "number", required: true } }, category: "chemistry", execute: async (a) => Stoichiometry.dilution(a.C1, a.V1, a.C2) },
  { id: "x_chem_gas_laws", name: "Gas Laws Calculator", description: "Boyle's, Charles's, combined gas law, Dalton's law", parameters: { operation: { type: "string", description: "boyles|charles|combined|dalton|rms", required: true }, params: { type: "string", required: true } }, category: "chemistry", execute: async (a) => { const p = JSON.parse(a.params); switch (a.operation) { case "boyles": return GasLaws.boylesLaw(p.P1, p.V1, p.V2); case "charles": return GasLaws.charlesLaw(p.V1, p.T1, p.T2); case "combined": return GasLaws.combinedGasLaw(p.P1, p.V1, p.T1, p.P2, p.V2); case "dalton": return GasLaws.daltonLaw(p.partialPressures); case "rms": return GasLaws.rootMeanSquareSpeed(p.molarMass, p.T); default: return { ok: false }; } } },
  { id: "x_chem_buffer", name: "Buffer pH Calculator", description: "Calculate buffer pH using Henderson-Hasselbalch equation", parameters: { pKa: { type: "number", required: true }, acidConc: { type: "number", required: true }, baseConc: { type: "number", required: true } }, category: "chemistry", execute: async (a) => Stoichiometry.bufferPH(a.pKa, a.acidConc, a.baseConc) },
  { id: "x_chem_nernst", name: "Nernst Equation Calculator", description: "Calculate electrode potential using Nernst equation", parameters: { E0: { type: "number", required: true }, n: { type: "number", required: true }, Q: { type: "number", required: true }, T: { type: "number" } }, category: "chemistry", execute: async (a) => Stoichiometry.nernst(a.E0, a.n, a.Q, a.T || 298.15) },
  { id: "x_chem_halflife", name: "Half-Life Calculator", description: "Calculate half-life for different reaction orders", parameters: { rateConstant: { type: "number", required: true }, order: { type: "number", required: true } }, category: "chemistry", execute: async (a) => Stoichiometry.halfLife(a.rateConstant, a.order) },
  { id: "x_chem_electrochemistry", name: "Electrochemistry Calculator", description: "Calculate cell potential and spontaneity", parameters: { e0cathode: { type: "number", required: true }, e0anode: { type: "number", required: true } }, category: "chemistry", execute: async (a) => Stoichiometry.electrochemistry(a.e0cathode, a.e0anode) },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTENDED BIOLOGY TOOLS (5 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_bio_punnett", name: "Punnett Square", description: "Generate Punnett square for genetic crosses", parameters: { parent1: { type: "string", description: "Genotype like Aa", required: true }, parent2: { type: "string", description: "Genotype like Aa", required: true } }, category: "biology", execute: async (a) => Genetics.punnettSquare(a.parent1, a.parent2) },
  { id: "x_bio_hardy_weinberg", name: "Hardy-Weinberg Equilibrium", description: "Calculate allele and genotype frequencies", parameters: { p: { type: "number", description: "Frequency of dominant allele (0-1)", required: true } }, category: "biology", execute: async (a) => Genetics.hardyWeinberg(a.p) },
  { id: "x_bio_dna_rna", name: "DNA to RNA Transcription", description: "Transcribe DNA sequence to RNA", parameters: { dna: { type: "string", required: true } }, category: "biology", execute: async (a) => Genetics.dnaToRNA(a.dna) },
  { id: "x_bio_gc_content", name: "GC Content Calculator", description: "Calculate GC content of DNA sequence", parameters: { sequence: { type: "string", required: true } }, category: "biology", execute: async (a) => Genetics.gcContent(a.sequence) },
  { id: "x_bio_population", name: "Population Growth Model", description: "Exponential or logistic population growth", parameters: { N0: { type: "number", required: true }, r: { type: "number", required: true }, t: { type: "number", required: true }, K: { type: "number", description: "Carrying capacity (optional, for logistic)" } }, category: "biology", execute: async (a) => Genetics.populationGrowth(a.N0, a.r, a.t, a.K) },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTENDED ENGINEERING TOOLS (12 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_eng_beam", name: "Beam Deflection Calculator", description: "Calculate max deflection of beams", parameters: { E: { type: "number", description: "Young's modulus (Pa)", required: true }, I: { type: "number", description: "Moment of inertia (m4)", required: true }, L: { type: "number", description: "Length (m)", required: true }, w: { type: "number", description: "Distributed load (N/m)", required: true }, type: { type: "string", description: "simply_supported|cantilever", required: true } }, category: "engineering", execute: async (a) => CivilEngineering.beamDeflection(a.E, a.I, a.L, a.w, a.type as any) },
  { id: "x_eng_reynolds", name: "Reynolds Number Calculator", description: "Calculate Reynolds number and flow regime", parameters: { rho: { type: "number", required: true }, v: { type: "number", required: true }, D: { type: "number", required: true }, mu: { type: "number", required: true } }, category: "engineering", execute: async (a) => CivilEngineering.reynoldsNumber(a.rho, a.v, a.D, a.mu) },
  { id: "x_eng_stress", name: "Stress-Strain Calculator", description: "Calculate stress, strain, Young's modulus", parameters: { force: { type: "number", required: true }, area: { type: "number", required: true }, originalLength: { type: "number", required: true }, deformation: { type: "number", required: true } }, category: "engineering", execute: async (a) => MechanicalEngineering.stressStrain(a.force, a.area, a.originalLength, a.deformation) },
  { id: "x_eng_buckling", name: "Buckling Load Calculator", description: "Calculate Euler critical buckling load", parameters: { E: { type: "number", required: true }, I: { type: "number", required: true }, L: { type: "number", required: true }, K: { type: "number", required: true } }, category: "engineering", execute: async (a) => MechanicalEngineering.bucklingLoad(a.E, a.I, a.L, a.K) },
  { id: "x_eng_gear", name: "Gear Ratio Calculator", description: "Calculate gear ratio and torque multiplier", parameters: { N1: { type: "number", description: "Teeth on driving gear", required: true }, N2: { type: "number", description: "Teeth on driven gear", required: true } }, category: "engineering", execute: async (a) => MechanicalEngineering.gearRatio(a.N1, a.N2) },
  { id: "x_eng_vibration", name: "Vibration Frequency Calculator", description: "Natural frequency and period of a spring-mass system", parameters: { k: { type: "number", description: "Spring constant (N/m)", required: true }, m: { type: "number", description: "Mass (kg)", required: true } }, category: "engineering", execute: async (a) => MechanicalEngineering.vibrationFrequency(a.k, a.m) },
  { id: "x_eng_three_phase", name: "Three-Phase Power Calculator", description: "Calculate real, reactive, and apparent power", parameters: { VL: { type: "number", description: "Line voltage (V)", required: true }, IL: { type: "number", description: "Line current (A)", required: true }, pf: { type: "number", description: "Power factor (0-1)", required: true } }, category: "engineering", execute: async (a) => ElectricalEngineering.threePhasePower(a.VL, a.IL, a.pf) },
  { id: "x_eng_transformer", name: "Transformer Calculator", description: "Calculate secondary voltage and type", parameters: { N1: { type: "number", required: true }, N2: { type: "number", required: true }, V1: { type: "number", required: true } }, category: "engineering", execute: async (a) => ElectricalEngineering.transformerTurns(a.N1, a.N2, a.V1) },
  { id: "x_eng_impedance", name: "Impedance Calculator", description: "Calculate impedance of RLC series circuit", parameters: { R: { type: "number", required: true }, L: { type: "number", required: true }, C: { type: "number", required: true }, f: { type: "number", required: true } }, category: "engineering", execute: async (a) => ElectricalEngineering.impedanceSeries(a.R, a.L, a.C, a.f) },
  { id: "x_eng_resonance", name: "Resonance Frequency Calculator", description: "Calculate LC resonance frequency", parameters: { L: { type: "number", required: true }, C: { type: "number", required: true } }, category: "engineering", execute: async (a) => ElectricalEngineering.resonanceFreq(a.L, a.C) },
  { id: "x_eng_battery", name: "Battery Life Calculator", description: "Calculate battery runtime from capacity and current", parameters: { capacity: { type: "number", description: "Capacity (Ah)", required: true }, current: { type: "number", description: "Current draw (A)", required: true }, dod: { type: "number", description: "Depth of discharge (0-1)", required: true } }, category: "engineering", execute: async (a) => ElectricalEngineering.batteryLife(a.capacity, a.current, a.dod) },
  { id: "x_eng_motor", name: "Motor Efficiency Calculator", description: "Calculate motor efficiency and losses", parameters: { Pout: { type: "number", description: "Output power (W)", required: true }, Pin: { type: "number", description: "Input power (W)", required: true } }, category: "engineering", execute: async (a) => ElectricalEngineering.motorEfficiency(a.Pout, a.Pin) },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTENDED FINANCE TOOLS (10 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_fin_compound", name: "Compound Interest Calculator", description: "Calculate compound interest and effective rate", parameters: { P: { type: "number", description: "Principal", required: true }, r: { type: "number", description: "Annual rate (decimal)", required: true }, n: { type: "number", description: "Compounds per year", required: true }, t: { type: "number", description: "Years", required: true } }, category: "finance", execute: async (a) => FinancialCalculations.compoundInterest(a.P, a.r, a.n, a.t) },
  { id: "x_fin_present_value", name: "Present Value Calculator", description: "Calculate present value of future amount", parameters: { FV: { type: "number", required: true }, r: { type: "number", required: true }, n: { type: "number", required: true } }, category: "finance", execute: async (a) => FinancialCalculations.presentValue(a.FV, a.r, a.n) },
  { id: "x_fin_mortgage", name: "Mortgage Calculator", description: "Calculate monthly payment, total paid, and interest", parameters: { principal: { type: "number", required: true }, annualRate: { type: "number", required: true }, years: { type: "number", required: true } }, category: "finance", execute: async (a) => FinancialCalculations.mortgage(a.principal, a.annualRate, a.years) },
  { id: "x_fin_npv", name: "NPV Calculator", description: "Calculate Net Present Value of cash flows", parameters: { cashFlows: { type: "string", description: "JSON array of cash flows", required: true }, rate: { type: "number", required: true } }, category: "finance", execute: async (a) => FinancialCalculations.npv(JSON.parse(a.cashFlows), a.rate) },
  { id: "x_fin_irr", name: "IRR Calculator", description: "Calculate Internal Rate of Return", parameters: { cashFlows: { type: "string", description: "JSON array", required: true } }, category: "finance", execute: async (a) => FinancialCalculations.irr(JSON.parse(a.cashFlows)) },
  { id: "x_fin_roi", name: "ROI Calculator", description: "Calculate return on investment", parameters: { gain: { type: "number", required: true }, cost: { type: "number", required: true } }, category: "finance", execute: async (a) => FinancialCalculations.roi(a.gain, a.cost) },
  { id: "x_fin_sharpe", name: "Sharpe Ratio Calculator", description: "Calculate Sharpe ratio for risk-adjusted return", parameters: { Rp: { type: "number", description: "Portfolio return", required: true }, Rf: { type: "number", description: "Risk-free rate", required: true }, sigma: { type: "number", description: "Portfolio std dev", required: true } }, category: "finance", execute: async (a) => FinancialCalculations.sharpeRatio(a.Rp, a.Rf, a.sigma) },
  { id: "x_fin_stock", name: "Stock Valuation (Gordon Growth)", description: "Calculate intrinsic stock value", parameters: { D0: { type: "number", description: "Current dividend", required: true }, g: { type: "number", description: "Growth rate", required: true }, r: { type: "number", description: "Required return", required: true } }, category: "finance", execute: async (a) => FinancialCalculations.stockValuation(a.D0, a.g, a.r) },
  { id: "x_fin_bond", name: "Bond Price Calculator", description: "Calculate bond price from coupon and yield", parameters: { faceValue: { type: "number", required: true }, couponRate: { type: "number", required: true }, yieldRate: { type: "number", required: true }, years: { type: "number", required: true } }, category: "finance", execute: async (a) => FinancialCalculations.bondPrice(a.faceValue, a.couponRate, a.yieldRate, a.years) },
  { id: "x_fin_black_scholes", name: "Black-Scholes Option Pricing", description: "Calculate option price using Black-Scholes model", parameters: { S: { type: "number", description: "Stock price", required: true }, K: { type: "number", description: "Strike price", required: true }, T: { type: "number", description: "Time to expiry (years)", required: true }, r: { type: "number", description: "Risk-free rate", required: true }, sigma: { type: "number", description: "Volatility", required: true }, type: { type: "string", description: "call|put", required: true } }, category: "finance", execute: async (a) => FinancialCalculations.blackScholes(a.S, a.K, a.T, a.r, a.sigma, a.type as any) },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTENDED DATA SCIENCE TOOLS (8 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_ds_normalize", name: "Data Normalizer", description: "Min-max normalize a dataset", parameters: { data: { type: "string", description: "JSON array", required: true }, min: { type: "number", required: true }, max: { type: "number", required: true } }, category: "data-science", execute: async (a) => DataScience.normalize(JSON.parse(a.data), a.min, a.max) },
  { id: "x_ds_distance", name: "Distance Calculator", description: "Euclidean distance between vectors", parameters: { a: { type: "string", description: "JSON array", required: true }, b: { type: "string", description: "JSON array", required: true } }, category: "data-science", execute: async (a) => DataScience.euclideanDistance(JSON.parse(a.a), JSON.parse(a.b)) },
  { id: "x_ds_cosine", name: "Cosine Similarity Calculator", description: "Calculate cosine similarity between vectors", parameters: { a: { type: "string", description: "JSON array", required: true }, b: { type: "string", description: "JSON array", required: true } }, category: "data-science", execute: async (a) => DataScience.cosineSimilarity(JSON.parse(a.a), JSON.parse(a.b)) },
  { id: "x_ds_entropy", name: "Information Entropy Calculator", description: "Calculate Shannon entropy of a distribution", parameters: { data: { type: "string", description: "JSON array of frequencies", required: true } }, category: "data-science", execute: async (a) => DataScience.entropy(JSON.parse(a.data)) },
  { id: "x_ds_gini", name: "Gini Impurity Calculator", description: "Calculate Gini impurity for decision trees", parameters: { labels: { type: "string", description: "JSON array of class labels", required: true } }, category: "data-science", execute: async (a) => DataScience.giniImpurity(JSON.parse(a.labels)) },
  { id: "x_ds_sigmoid", name: "Sigmoid Function Calculator", description: "Calculate sigmoid and its derivative", parameters: { z: { type: "number", required: true } }, category: "data-science", execute: async (a) => DataScience.sigmoid(a.z) },
  { id: "x_ds_softmax", name: "Softmax Calculator", description: "Calculate softmax probabilities", parameters: { arr: { type: "string", description: "JSON array of logits", required: true } }, category: "data-science", execute: async (a) => DataScience.softmax(JSON.parse(a.arr)) },
  { id: "x_ds_kmeans", name: "K-Means Clustering", description: "Cluster data points using K-Means", parameters: { points: { type: "string", description: "JSON array of points", required: true }, k: { type: "number", required: true } }, category: "data-science", execute: async (a) => DataScience.kMeans(JSON.parse(a.points), a.k) },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTENDED SECURITY TOOLS (8 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_sec_password", name: "Password Strength Analyzer", description: "Analyze password strength, entropy, and crack time", parameters: { password: { type: "string", required: true } }, category: "security", execute: async (a) => SecurityTools.passwordStrength(a.password) },
  { id: "x_sec_caesar", name: "Caesar Cipher", description: "Encrypt/decrypt text using Caesar cipher", parameters: { text: { type: "string", required: true }, shift: { type: "number", required: true } }, category: "security", execute: async (a) => SecurityTools.caesarCipher(a.text, a.shift) },
  { id: "x_sec_subnet", name: "Subnet Calculator", description: "Calculate subnet mask, network, broadcast addresses", parameters: { ip: { type: "string", required: true }, cidr: { type: "number", required: true } }, category: "security", execute: async (a) => SecurityTools.subnetCalculator(a.ip, a.cidr) },
  { id: "x_sec_entropy", name: "Randomness Entropy Analyzer", description: "Measure entropy/randomness of data", parameters: { data: { type: "string", required: true } }, category: "security", execute: async (a) => SecurityTools.entropyRandomness(a.data) },
  { id: "x_sec_xor", name: "XOR Encryption", description: "Encrypt/decrypt data using XOR cipher", parameters: { data: { type: "string", required: true }, key: { type: "string", required: true } }, category: "security", execute: async (a) => SecurityTools.xorEncrypt(a.data, a.key) },
  { id: "x_sec_cve", name: "CVSS Score Calculator", description: "Calculate CVSS v3.1 base score", parameters: { vector: { type: "string", description: "JSON with AV,AC,PR,UI,S,C,I,A", required: true } }, category: "security", execute: async (a) => SecurityTools.cveScore(JSON.parse(a.vector)) },
  { id: "x_sec_hash_id", name: "Hash Identifier", description: "Identify hash algorithm by length and format", parameters: { hash: { type: "string", required: true } }, category: "security", execute: async (a) => SecurityTools.hashIdentifier(a.hash) },
  { id: "x_sec_ssl", name: "SSL Certificate Checker", description: "Check SSL certificate details for a domain", parameters: { domain: { type: "string", required: true } }, category: "security", execute: async (a) => SecurityTools.sslCheck(a.domain) },

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTENDED DAILY LIFE TOOLS (12 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_life_bmi", name: "BMI Calculator", description: "Calculate Body Mass Index and category", parameters: { weightKg: { type: "number", required: true }, heightM: { type: "number", required: true } }, category: "daily-life", execute: async (a) => DailyLifeTools.bmi(a.weightKg, a.heightM) },
  { id: "x_life_calories", name: "Calorie Needs Calculator", description: "Calculate BMR, TDEE, and recommended intake", parameters: { weight: { type: "number", description: "kg", required: true }, height: { type: "number", description: "cm", required: true }, age: { type: "number", required: true }, gender: { type: "string", description: "male|female", required: true }, activity: { type: "string", description: "sedentary|light|moderate|active|very_active", required: true } }, category: "daily-life", execute: async (a) => DailyLifeTools.calorieNeeds(a.weight, a.height, a.age, a.gender as any, a.activity) },
  { id: "x_life_tip", name: "Tip Calculator", description: "Calculate tip amount and split bill", parameters: { bill: { type: "number", required: true }, tipPercent: { type: "number", required: true }, split: { type: "number", required: true } }, category: "daily-life", execute: async (a) => DailyLifeTools.tipCalculator(a.bill, a.tipPercent, a.split) },
  { id: "x_life_emi", name: "Loan EMI Calculator", description: "Calculate equated monthly installment", parameters: { principal: { type: "number", required: true }, rate: { type: "number", description: "Annual rate %", required: true }, tenure: { type: "number", description: "Years", required: true } }, category: "daily-life", execute: async (a) => DailyLifeTools.loanEMI(a.principal, a.rate, a.tenure) },
  { id: "x_life_unit", name: "Unit Converter", description: "Convert between common units", parameters: { value: { type: "number", required: true }, from: { type: "string", required: true }, to: { type: "string", required: true } }, category: "daily-life", execute: async (a) => DailyLifeTools.unitConversion(a.value, a.from, a.to) },
  { id: "x_life_date_diff", name: "Date Difference Calculator", description: "Calculate days, hours, minutes between dates", parameters: { date1: { type: "string", description: "YYYY-MM-DD", required: true }, date2: { type: "string", description: "YYYY-MM-DD", required: true } }, category: "daily-life", execute: async (a) => DailyLifeTools.dateDiff(a.date1, a.date2) },
  { id: "x_life_heart_rate", name: "Heart Rate Zones Calculator", description: "Calculate training heart rate zones", parameters: { age: { type: "number", required: true } }, category: "daily-life", execute: async (a) => DailyLifeTools.heartRateZones(a.age) },
  { id: "x_life_age", name: "Age Calculator", description: "Calculate exact age from birth date", parameters: { birthDate: { type: "string", description: "YYYY-MM-DD", required: true } }, category: "daily-life", execute: async (a) => DailyLifeTools.ageCalculator(a.birthDate) },
  { id: "x_life_text_stats", name: "Text Statistics Analyzer", description: "Word count, sentence count, reading time", parameters: { text: { type: "string", required: true } }, category: "daily-life", execute: async (a) => DailyLifeTools.textStats(a.text) },
  { id: "x_life_temp", name: "Temperature Converter", description: "Convert between Celsius, Fahrenheit, Kelvin", parameters: { celsius: { type: "number", required: true } }, category: "daily-life", execute: async (a) => DailyLifeTools.celsiusToFahrenheit(a.celsius) },
  { id: "x_life_fuel", name: "Fuel Efficiency Calculator", description: "Calculate km/L, L/100km, and MPG", parameters: { distance: { type: "number", description: "km", required: true }, fuelUsed: { type: "number", description: "liters", required: true } }, category: "daily-life", execute: async (a) => DailyLifeTools.fuelEfficiency(a.distance, a.fuelUsed) },
  { id: "x_life_gst", name: "GST Calculator", description: "Calculate GST amount and total", parameters: { amount: { type: "number", required: true }, gstRate: { type: "number", description: "GST %", required: true } }, category: "daily-life", execute: async (a) => DailyLifeTools.gstCalculator(a.amount, a.gstRate) },
  { id: "x_life_wpm", name: "Words Per Minute Calculator", description: "Calculate typing/reading speed", parameters: { text: { type: "string", required: true }, timeSeconds: { type: "number", required: true } }, category: "daily-life", execute: async (a) => DailyLifeTools.wordsPerMinute(a.text, a.timeSeconds) },

  // ═══════════════════════════════════════════════════════════════════════════
  // DAILY TASK SYSTEM (5 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_task_create", name: "Create Daily Task", description: "Create a scheduled daily task with specific time and action", parameters: { name: { type: "string", description: "Task name", required: true }, time: { type: "string", description: "Time like '09:00' or '14:30'", required: true }, action: { type: "string", description: "What to do: 'open_app', 'run_script', 'send_message', 'browse_url', 'ai_prompt'", required: true }, target: { type: "string", description: "App name, URL, or script path", required: true }, prompt: { type: "string", description: "AI prompt to execute when task runs (for ai_prompt action)" }, days: { type: "string", description: "Days: 'mon-fri', 'daily', 'weekends', or comma-separated 'mon,tue,wed'" } }, category: "daily-task", execute: async (a) => { try { const fs = require('fs'); const path = require('path'); const tasksFile = path.join(process.env.HOME || process.env.USERPROFILE || '', '.zyraxon', 'daily-tasks.json'); let tasks = []; if (fs.existsSync(tasksFile)) { tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8')); } const task = { id: Date.now().toString(36), name: a.name, time: a.time, action: a.action, target: a.target, prompt: a.prompt || '', days: a.days || 'daily', enabled: true, lastRun: null, createdAt: new Date().toISOString() }; tasks.push(task); fs.mkdirSync(path.dirname(tasksFile), { recursive: true }); fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2)); return { ok: true, data: task }; } catch (e) { return { ok: false, error: e.message }; } } },
  { id: "x_task_list", name: "List Daily Tasks", description: "List all scheduled daily tasks", parameters: {}, category: "daily-task", execute: async () => { try { const fs = require('fs'); const path = require('path'); const tasksFile = path.join(process.env.HOME || process.env.USERPROFILE || '', '.zyraxon', 'daily-tasks.json'); if (!fs.existsSync(tasksFile)) return { ok: true, data: [] }; const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8')); return { ok: true, data: tasks }; } catch (e) { return { ok: false, error: e.message }; } } },
  { id: "x_task_delete", name: "Delete Daily Task", description: "Delete a scheduled task by ID", parameters: { taskId: { type: "string", description: "Task ID to delete", required: true } }, category: "daily-task", execute: async (a) => { try { const fs = require('fs'); const path = require('path'); const tasksFile = path.join(process.env.HOME || process.env.USERPROFILE || '', '.zyraxon', 'daily-tasks.json'); if (!fs.existsSync(tasksFile)) return { ok: false, error: 'No tasks file found' }; let tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8')); const before = tasks.length; tasks = tasks.filter((t) => t.id !== a.taskId); fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2)); return { ok: true, data: { deleted: before - tasks.length > 0 } }; } catch (e) { return { ok: false, error: e.message }; } } },
  { id: "x_task_toggle", name: "Enable/Disable Daily Task", description: "Toggle a task on or off", parameters: { taskId: { type: "string", required: true }, enabled: { type: "boolean", required: true } }, category: "daily-task", execute: async (a) => { try { const fs = require('fs'); const path = require('path'); const tasksFile = path.join(process.env.HOME || process.env.USERPROFILE || '', '.zyraxon', 'daily-tasks.json'); if (!fs.existsSync(tasksFile)) return { ok: false, error: 'No tasks file found' }; let tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8')); const task = tasks.find((t) => t.id === a.taskId); if (!task) return { ok: false, error: 'Task not found' }; task.enabled = a.enabled; fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2)); return { ok: true, data: task }; } catch (e) { return { ok: false, error: e.message }; } } },
  { id: "x_task_run_now", name: "Run Daily Task Now", description: "Immediately execute a scheduled task", parameters: { taskId: { type: "string", required: true } }, category: "daily-task", execute: async (a) => { try { const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process'); const tasksFile = path.join(process.env.HOME || process.env.USERPROFILE || '', '.zyraxon', 'daily-tasks.json'); if (!fs.existsSync(tasksFile)) return { ok: false, error: 'No tasks file found' }; const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf-8')); const task = tasks.find((t) => t.id === a.taskId); if (!task) return { ok: false, error: 'Task not found' }; let result = ''; if (task.action === 'open_app') { if (process.platform === 'win32') { execSync(`start "" "${task.target}"`, { timeout: 10000 }); } else if (process.platform === 'darwin') { execSync(`open "${task.target}"`, { timeout: 10000 }); } else { execSync(`${task.target} &`, { timeout: 10000 }); } result = `Opened: ${task.target}`; } else if (task.action === 'browse_url') { result = `URL: ${task.target}`; } else if (task.action === 'run_script') { result = execSync(task.target, { encoding: 'utf-8', timeout: 30000 }); } return { ok: true, data: { task: task.name, result } }; } catch (e) { return { ok: false, error: e.message }; } } },

  // ═══════════════════════════════════════════════════════════════════════════
  // DAILY TASK AUTO-SCHEDULER (2 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  {
    id: "x_task_start_scheduler",
    name: "Start Daily Task Scheduler",
    description: "Start the auto-scheduler daemon. Checks every 60 seconds and auto-runs tasks when their time arrives. Runs in background.",
    parameters: {},
    category: "daily-task",
    execute: async () => {
      try {
        const fs = require("fs");
        const path = require("path");
        const { spawn } = require("child_process");
        const tasksFile = path.join(process.env.HOME || process.env.USERPROFILE || "", ".zyraxon", "daily-tasks.json");
        const logFile = path.join(process.env.HOME || process.env.USERPROFILE || "", ".zyraxon", "task-scheduler.log");

        // Check if scheduler already running
        const pidFile = path.join(process.env.HOME || process.env.USERPROFILE || "", ".zyraxon", "scheduler.pid");
        if (fs.existsSync(pidFile)) {
          const oldPid = parseInt(fs.readFileSync(pidFile, "utf-8").trim());
          try { process.kill(oldPid, 0); return { ok: true, data: { message: "Scheduler already running", pid: oldPid } }; } catch { /* not running, continue */ }
        }

        function getDayOfWeek() { return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date().getDay()]; }
        function isTaskScheduledToday(task) {
          const days = (task.days || "daily").toLowerCase();
          if (days === "daily") return true;
          const today = getDayOfWeek();
          if (days === "weekends") return today === "sat" || today === "sun";
          if (days === "mon-fri") return ["mon", "tue", "wed", "thu", "fri"].includes(today);
          return days.split(",").map((d) => d.trim()).includes(today);
        }
        function checkAndRunTasks() {
          try {
            if (!fs.existsSync(tasksFile)) return;
            const tasks = JSON.parse(fs.readFileSync(tasksFile, "utf-8"));
            const now = new Date();
            const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
            for (const task of tasks) {
              if (!task.enabled || !isTaskScheduledToday(task)) continue;
              if (task.lastRun) {
                const lastRun = new Date(task.lastRun);
                const diffMinutes = (now.getTime() - lastRun.getTime()) / 60000;
                if (diffMinutes < 59) continue; // Already ran this hour
              }
              if (task.time === currentTime) {
                task.lastRun = now.toISOString();
                fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));
                const logEntry = `[${now.toISOString()}] AUTO-RUN: ${task.name} (${task.action}: ${task.target})\n`;
                fs.appendFileSync(logFile, logEntry);
                // Execute the task
                const { execSync } = require("child_process");
                if (task.action === "open_app") {
                  if (process.platform === "win32") execSync(`start "" "${task.target}"`, { timeout: 10000 });
                  else if (process.platform === "darwin") execSync(`open "${task.target}"`, { timeout: 10000 });
                  else execSync(`${task.target} &`, { timeout: 10000 });
                } else if (task.action === "browse_url") {
                  if (process.platform === "win32") execSync(`start "" "${task.target}"`, { timeout: 10000 });
                  else execSync(`open "${task.target}"`, { timeout: 10000 });
                } else if (task.action === "run_script") {
                  execSync(task.target, { encoding: "utf-8", timeout: 30000 });
                }
              }
            }
          } catch (e) {
            fs.appendFileSync(logFile, `[${new Date().toISOString()}] ERROR: ${e.message}\n`);
          }
        }

        // Start background checker
        fs.mkdirSync(path.dirname(tasksFile), { recursive: true });
        fs.writeFileSync(pidFile, String(process.pid));
        const interval = setInterval(checkAndRunTasks, 60000);
        checkAndRunTasks(); // Run immediately on start

        // Keep process alive
        process.on("SIGTERM", () => { clearInterval(interval); try { fs.unlinkSync(pidFile); } catch {} process.exit(0); });
        process.on("SIGINT", () => { clearInterval(interval); try { fs.unlinkSync(pidFile); } catch {} process.exit(0); });

        return { ok: true, data: { message: "Daily task scheduler started", pid: process.pid, checkInterval: "60 seconds" } };
      } catch (e) { return { ok: false, error: e.message }; }
    },
  },
  {
    id: "x_task_scheduler_status",
    name: "Scheduler Status",
    description: "Check if the daily task scheduler is running and see recent activity",
    parameters: {},
    category: "daily-task",
    execute: async () => {
      try {
        const fs = require("fs");
        const path = require("path");
        const pidFile = path.join(process.env.HOME || process.env.USERPROFILE || "", ".zyraxon", "scheduler.pid");
        const logFile = path.join(process.env.HOME || process.env.USERPROFILE || "", ".zyraxon", "task-scheduler.log");
        const tasksFile = path.join(process.env.HOME || process.env.USERPROFILE || "", ".zyraxon", "daily-tasks.json");

        let running = false;
        let pid = null;
        if (fs.existsSync(pidFile)) {
          pid = parseInt(fs.readFileSync(pidFile, "utf-8").trim());
          try { process.kill(pid, 0); running = true; } catch { running = false; }
        }

        let tasks = [];
        if (fs.existsSync(tasksFile)) tasks = JSON.parse(fs.readFileSync(tasksFile, "utf-8"));
        let recentLogs = [];
        if (fs.existsSync(logFile)) {
          const lines = fs.readFileSync(logFile, "utf-8").split("\n").filter(Boolean);
          recentLogs = lines.slice(-10);
        }

        return { ok: true, data: { running, pid, totalTasks: tasks.length, enabledTasks: tasks.filter((t) => t.enabled).length, recentLogs } };
      } catch (e) { return { ok: false, error: e.message }; }
    },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // CAPTCHA SOLVING TOOLS (4 tools)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_captcha_detect", name: "Detect Captcha Type", description: "Detect what type of captcha is on the current page", parameters: {}, category: "captcha", execute: async () => { try { const http = require('http'); const result = await new Promise((resolve, reject) => { http.get('http://127.0.0.1:9222/json', (res) => { let data = ''; res.on('data', (c) => data += c); res.on('end', () => resolve(JSON.parse(data))); }).on('error', reject); }); const ws = result[0]?.webSocketDebuggerUrl; if (!ws) return { ok: false, error: 'No Chrome tab found' }; const WebSocket = require('ws'); const socket = new WebSocket(ws); const captcha = await new Promise((resolve) => { socket.on('open', () => { socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `JSON.stringify((() => { if (document.querySelector('iframe[src*="recaptcha"]') || document.querySelector('.g-recaptcha')) return {type:'recaptcha-v2',confidence:0.95}; if (document.querySelector('iframe[src*="hcaptcha"]') || document.querySelector('.h-captcha')) return {type:'hcaptcha',confidence:0.95}; if (document.querySelector('iframe[src*="challenges.cloudflare.com"]') || document.querySelector('[data-sitekey]')) return {type:'turnstile',confidence:0.90}; const c=document.querySelector('canvas'); if(c&&c.width>50&&c.height>50) return {type:'image-captcha',confidence:0.70}; const img=document.querySelector('img[src*="captcha"],img[alt*="captcha"]'); if(img) return {type:'text-captcha',confidence:0.80}; return {type:'none',confidence:0}; })())`, returnByValue: true } })); }); socket.on('message', (data) => { const msg = JSON.parse(data.toString()); if (msg.id === 1) { resolve(JSON.parse(msg.result?.result?.value || '{"type":"none","confidence":0}')); socket.close(); } }); setTimeout(() => { resolve({ type: 'timeout', confidence: 0 }); socket.close(); }, 5000); }); return { ok: true, data: captcha }; } catch (e) { return { ok: false, error: e.message }; } } },
  { id: "x_captcha_click", name: "Click Captcha Checkbox", description: "Click the captcha checkbox (reCAPTCHA, hCaptcha, Turnstile)", parameters: {}, category: "captcha", execute: async () => { try { const http = require('http'); const result = await new Promise((resolve, reject) => { http.get('http://127.0.0.1:9222/json', (res) => { let data = ''; res.on('data', (c) => data += c); res.on('end', () => resolve(JSON.parse(data))); }).on('error', reject); }); const ws = result[0]?.webSocketDebuggerUrl; if (!ws) return { ok: false, error: 'No Chrome tab found' }; const WebSocket = require('ws'); const socket = new WebSocket(ws); const clicked = await new Promise((resolve) => { socket.on('open', () => { socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `(() => { const f=document.querySelector('iframe[src*="recaptcha/anchor"]'); if(f){const r=f.getBoundingClientRect();document.elementFromPoint(r.left+28,r.top+28)?.click();return true;} const h=document.querySelector('iframe[src*="hcaptcha/checkbox"]'); if(h){const r=h.getBoundingClientRect();document.elementFromPoint(r.left+28,r.top+28)?.click();return true;} const t=document.querySelector('[data-sitekey]'); if(t){t.click();return true;} return false; })()`, returnByValue: true } })); }); socket.on('message', (data) => { const msg = JSON.parse(data.toString()); if (msg.id === 1) { resolve(msg.result?.result?.value === true); socket.close(); } }); setTimeout(() => { resolve(false); socket.close(); }, 5000); }); return { ok: true, data: { clicked } }; } catch (e) { return { ok: false, error: e.message }; } } },
  { id: "x_captcha_solve_image", name: "Solve Image Captcha", description: "Attempt to solve image-based captcha using OCR", parameters: { imageData: { type: "string", description: "Base64 image data or image URL", required: true } }, category: "captcha", execute: async (a) => { try { const http = require('http'); const result = await new Promise((resolve, reject) => { http.get('http://127.0.0.1:9222/json', (res) => { let data = ''; res.on('data', (c) => data += c); res.on('end', () => resolve(JSON.parse(data))); }).on('error', reject); }); const ws = result[0]?.webSocketDebuggerUrl; if (!ws) return { ok: false, error: 'No Chrome tab found' }; const WebSocket = require('ws'); const socket = new WebSocket(ws); const text = await new Promise((resolve) => { socket.on('open', () => { socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `(() => { const img=document.querySelector('img[src*="captcha"],img[alt*="captcha"],img[id*="captcha"]'); if(!img) return ''; const c=document.createElement('canvas'); c.width=img.naturalWidth||img.width; c.height=img.naturalHeight||img.height; const ctx=c.getContext('2d'); ctx.drawImage(img,0,0); return c.toDataURL('image/png'); })()`, returnByValue: true } })); }); socket.on('message', (data) => { const msg = JSON.parse(data.toString()); if (msg.id === 1) { resolve(msg.result?.result?.value || ''); socket.close(); } }); setTimeout(() => { resolve(''); socket.close(); }, 5000); }); return { ok: true, data: { captchaImage: text, message: 'Image captured. Use AI vision to read the text.' } }; } catch (e) { return { ok: false, error: e.message }; } } },
  { id: "x_captcha_input", name: "Input Captcha Text", description: "Type captcha solution into the input field", parameters: { text: { type: "string", description: "Captcha text to type", required: true } }, category: "captcha", execute: async (a) => { try { const http = require('http'); const result = await new Promise((resolve, reject) => { http.get('http://127.0.0.1:9222/json', (res) => { let data = ''; res.on('data', (c) => data += c); res.on('end', () => resolve(JSON.parse(data))); }).on('error', reject); }); const ws = result[0]?.webSocketDebuggerUrl; if (!ws) return { ok: false, error: 'No Chrome tab found' }; const WebSocket = require('ws'); const socket = new WebSocket(ws); const success = await new Promise((resolve) => { socket.on('open', () => { socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `(() => { const input=document.querySelector('input[name*="captcha"],input[id*="captcha"],input[placeholder*="captcha"],input[aria-label*="captcha"]'); if(!input){const inputs=document.querySelectorAll('input[type="text"]'); if(inputs.length>0){inputs[inputs.length-1].focus();inputs[inputs.length-1].value='${a.text.replace(/'/g,"\\'")}';inputs[inputs.length-1].dispatchEvent(new Event('input',{bubbles:true}));inputs[inputs.length-1].dispatchEvent(new Event('change',{bubbles:true}));return true;} return false;} input.focus(); input.value='${a.text.replace(/'/g,"\\'")}'; input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`, returnByValue: true } })); }); socket.on('message', (data) => { const msg = JSON.parse(data.toString()); if (msg.id === 1) { resolve(msg.result?.result?.value === true); socket.close(); } }); setTimeout(() => { resolve(false); socket.close(); }, 5000); }); return { ok: true, data: { success } }; } catch (e) { return { ok: false, error: e.message }; } } },

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMORY SYSTEM (7 tools) — Persistent memory like Claude
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_memory_view", name: "View Memory", description: "View all memory files and their contents", parameters: {}, category: "memory", execute: async () => MemorySystem.view() },
  { id: "x_memory_create", name: "Create Memory", description: "Create a new memory file with content", parameters: { filename: { type: "string", description: "Memory file name", required: true }, content: { type: "string", description: "Content to store", required: true } }, category: "memory", execute: async (a) => MemorySystem.create(a.filename, a.content) },
  { id: "x_memory_read", name: "Read Memory", description: "Read a specific memory file", parameters: { filename: { type: "string", required: true } }, category: "memory", execute: async (a) => MemorySystem.read(a.filename) },
  { id: "x_memory_update", name: "Update Memory", description: "Update text in a memory file", parameters: { filename: { type: "string", required: true }, oldText: { type: "string", required: true }, newText: { type: "string", required: true } }, category: "memory", execute: async (a) => MemorySystem.update(a.filename, a.oldText, a.newText) },
  { id: "x_memory_append", name: "Append to Memory", description: "Append content to a memory file", parameters: { filename: { type: "string", required: true }, content: { type: "string", required: true } }, category: "memory", execute: async (a) => MemorySystem.append(a.filename, a.content) },
  { id: "x_memory_delete", name: "Delete Memory", description: "Delete a memory file", parameters: { filename: { type: "string", required: true } }, category: "memory", execute: async (a) => MemorySystem.delete(a.filename) },
  { id: "x_memory_search", name: "Search Memory", description: "Search across all memory files for text", parameters: { query: { type: "string", required: true } }, category: "memory", execute: async (a) => MemorySystem.search(a.query) },

  // ═══════════════════════════════════════════════════════════════════════════
  // DOCUMENT TOOLS (5 tools) — Create, read, edit documents
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_doc_read", name: "Read Document", description: "Read any document file (txt, md, json, etc.)", parameters: { path: { type: "string", description: "File path", required: true } }, category: "documents", execute: async (a) => DocumentTools.readDocument(a.path) },
  { id: "x_doc_create", name: "Create Document", description: "Create a new document file", parameters: { path: { type: "string", required: true }, content: { type: "string", required: true } }, category: "documents", execute: async (a) => DocumentTools.createDocument(a.path, a.content) },
  { id: "x_doc_edit", name: "Edit Document", description: "Replace text in a document", parameters: { path: { type: "string", required: true }, oldText: { type: "string", required: true }, newText: { type: "string", required: true } }, category: "documents", execute: async (a) => DocumentTools.editDocument(a.path, a.oldText, a.newText) },
  { id: "x_doc_markdown_to_html", name: "Markdown to HTML", description: "Convert markdown text to HTML", parameters: { markdown: { type: "string", required: true } }, category: "documents", execute: async (a) => DocumentTools.convertMarkdownToHtml(a.markdown) },
  { id: "x_doc_count_words", name: "Count Words", description: "Count words, characters, sentences, reading time", parameters: { text: { type: "string", required: true } }, category: "documents", execute: async (a) => DocumentTools.countWords(a.text) },

  // ═══════════════════════════════════════════════════════════════════════════
  // SKILL CREATOR (3 tools) — Create and manage AI skills
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_skill_create", name: "Create Skill", description: "Create a new AI skill with instructions", parameters: { name: { type: "string", description: "Skill name", required: true }, description: { type: "string", description: "What the skill does", required: true }, instructions: { type: "string", description: "Detailed instructions for the skill", required: true } }, category: "skills", execute: async (a) => SkillCreator.createSkill(a.name, a.description, a.instructions) },
  { id: "x_skill_list", name: "List Skills", description: "List all available AI skills", parameters: {}, category: "skills", execute: async () => SkillCreator.listSkills() },
  { id: "x_skill_delete", name: "Delete Skill", description: "Delete an AI skill", parameters: { name: { type: "string", required: true } }, category: "skills", execute: async (a) => SkillCreator.deleteSkill(a.name) },

  // ═══════════════════════════════════════════════════════════════════════════
  // SUBSCRIPTION STATUS (1 tool — AI can always check its tier)
  // ═══════════════════════════════════════════════════════════════════════════
  { id: "x_subscription_status", name: "Subscription Status", description: "Check current subscription tier, tools available, days remaining, and features unlocked. Always available regardless of tier.", parameters: {}, category: "subscription", execute: async () => { const { execute: subExec } = await import("./subscription-status"); return subExec({}); } },

  // ══════════════════════════════════════════════════════════════════════════════════════
  // MISSING EXTENDED CHEMISTRY TOOLS (5 tools)
  // ══════════════════════════════════════════════════════════════════════════════════════
  { id: "x_chem_limiting_reagent", name: "Limiting Reagent Calculator", description: "Determine the limiting reagent and theoretical yield in a chemical reaction", parameters: { reactants: { type: "string", description: "JSON array of {moles, coefficient} objects", required: true } }, category: "chemistry", execute: async (a) => Stoichiometry.limitingReagent(JSON.parse(a.reactants)) },
  { id: "x_chem_percent_composition", name: "Percent Composition Calculator", description: "Calculate the percent composition by mass of each element in a compound", parameters: { formula: { type: "string", description: "Chemical formula like C6H12O6", required: true } }, category: "chemistry", execute: async (a) => Stoichiometry.percentComposition(a.formula) },
  { id: "x_acid_ph_strong", name: "Strong Acid pH Calculator", description: "Calculate pH and pOH for a strong acid solution with full dissociation", parameters: { concentration: { type: "number", description: "Molar concentration of the strong acid", required: true } }, category: "chemistry", execute: async (a) => AcidBase.pHStrongAcid(a.concentration) },
  { id: "x_acid_ph_weak", name: "Weak Acid pH Calculator", description: "Calculate pH and percent ionization for a weak acid using Ka equilibrium", parameters: { Ka: { type: "number", description: "Acid dissociation constant", required: true }, concentration: { type: "number", description: "Molar concentration", required: true } }, category: "chemistry", execute: async (a) => AcidBase.pHWeakAcid(a.Ka, a.concentration) },
  { id: "x_acid_titration", name: "Titration Calculator", description: "Calculate pH at any point in an acid-base titration curve", parameters: { Ca: { type: "number", description: "Acid concentration (M)", required: true }, Va: { type: "number", description: "Acid volume (mL)", required: true }, Cb: { type: "number", description: "Base concentration (M)", required: true }, Vb: { type: "number", description: "Base volume (mL)", required: true } }, category: "chemistry", execute: async (a) => AcidBase.titration(a.Ca, a.Va, a.Cb, a.Vb) },

  // ══════════════════════════════════════════════════════════════════════════════════════
  // MISSING EXTENDED BIOLOGY TOOLS (4 tools)
  // ══════════════════════════════════════════════════════════════════════════════════════
  { id: "x_bio_shannon_index", name: "Shannon Diversity Index", description: "Calculate biodiversity index using Shannon-Wiener formula with evenness and species richness", parameters: { species: { type: "string", description: "JSON array of species counts", required: true } }, category: "biology", execute: async (a) => Ecology.shannonIndex(JSON.parse(a.species)) },
  { id: "x_bio_simpson_index", name: "Simpson Diversity Index", description: "Calculate Simpson's diversity index (1-D) for ecological community analysis", parameters: { species: { type: "string", description: "JSON array of species counts", required: true } }, category: "biology", execute: async (a) => Ecology.simpsonIndex(JSON.parse(a.species)) },
  { id: "x_bio_michaelis_menten", name: "Michaelis-Menten Kinetics", description: "Calculate enzyme reaction velocity using Michaelis-Menten equation for enzyme kinetics", parameters: { Vmax: { type: "number", description: "Maximum reaction velocity", required: true }, Km: { type: "number", description: "Michaelis constant", required: true }, S: { type: "number", description: "Substrate concentration", required: true } }, category: "biology", execute: async (a) => Biochemistry.michaelisMenten(a.Vmax, a.Km, a.S) },
  { id: "x_bio_hill_equation", name: "Hill Equation Calculator", description: "Model cooperative binding with Hill equation for allosteric enzyme analysis", parameters: { Vmax: { type: "number", required: true }, S: { type: "number", description: "Substrate concentration", required: true }, Kd: { type: "number", description: "Dissociation constant", required: true }, n: { type: "number", description: "Hill coefficient", required: true } }, category: "biology", execute: async (a) => Biochemistry.hillEquation(a.Vmax, a.S, a.Kd, a.n) },

  // ══════════════════════════════════════════════════════════════════════════════════════
  // MISSING EXTENDED ENGINEERING TOOLS (9 tools)
  // ══════════════════════════════════════════════════════════════════════════════════════
  { id: "x_eng_mohrs_circle", name: "Mohr's Circle Calculator", description: "Calculate stress center and maximum shear stress using Mohr's circle for stress transformation", parameters: { sigma1: { type: "number", description: "Principal stress 1 (Pa)", required: true }, sigma3: { type: "number", description: "Principal stress 3 (Pa)", required: true } }, category: "engineering", execute: async (a) => CivilEngineering.mohrsCircle(a.sigma1, a.sigma3) },
  { id: "x_eng_flow_rate", name: "Flow Rate Calculator", description: "Calculate volumetric flow rate through a cross-sectional area at given velocity", parameters: { area: { type: "number", description: "Cross-sectional area (m2)", required: true }, velocity: { type: "number", description: "Flow velocity (m/s)", required: true } }, category: "engineering", execute: async (a) => CivilEngineering.flowRate(a.area, a.velocity) },
  { id: "x_eng_pipe_flow", name: "Pipe Flow Head Loss", description: "Calculate friction head loss in pipes using Darcy-Weisbach equation", parameters: { D: { type: "number", description: "Pipe diameter (m)", required: true }, L: { type: "number", description: "Pipe length (m)", required: true }, f: { type: "number", description: "Friction factor", required: true }, v: { type: "number", description: "Flow velocity (m/s)", required: true } }, category: "engineering", execute: async (a) => CivilEngineering.pipeFlow(a.D, a.L, a.f, a.v) },
  { id: "x_eng_concrete_mix", name: "Concrete Mix Design", description: "Calculate water-cement ratio, cement weight, and water volume for target concrete strength", parameters: { strength: { type: "number", description: "Target compressive strength (MPa)", required: true } }, category: "engineering", execute: async (a) => CivilEngineering.concreteMix(a.strength) },
  { id: "x_eng_torsion", name: "Torsion Calculator", description: "Calculate shear stress and angle of twist in a circular shaft under torsional load", parameters: { J: { type: "number", description: "Polar moment of inertia", required: true }, r: { type: "number", description: "Outer radius (m)", required: true }, T: { type: "number", description: "Applied torque (N.m)", required: true }, L: { type: "number", description: "Shaft length (m)", required: true }, G: { type: "number", description: "Shear modulus (Pa)", required: true } }, category: "engineering", execute: async (a) => MechanicalEngineering.torsion(a.J, a.r, a.T, a.L, a.G) },
  { id: "x_eng_thermal_stress", name: "Thermal Stress Calculator", description: "Calculate thermal stress and strain in constrained materials due to temperature change", parameters: { E: { type: "number", description: "Young's modulus (Pa)", required: true }, alpha: { type: "number", description: "Coefficient of thermal expansion (1/K)", required: true }, deltaT: { type: "number", description: "Temperature change (K)", required: true }, v: { type: "number", description: "Poisson's ratio (default 0.3)" } }, category: "engineering", execute: async (a) => MechanicalEngineering.thermalStress(a.E, a.alpha, a.deltaT, a.v) },
  { id: "x_eng_heat_exchanger", name: "Heat Exchanger Calculator", description: "Calculate heat transfer rate using LMTD method for heat exchanger sizing", parameters: { U: { type: "number", description: "Overall heat transfer coefficient (W/m2.K)", required: true }, A: { type: "number", description: "Heat transfer area (m2)", required: true }, LMTD: { type: "number", description: "Log mean temperature difference (K)", required: true } }, category: "engineering", execute: async (a) => MechanicalEngineering.heatExchanger(a.U, a.A, a.LMTD) },
  { id: "x_eng_filter_design", name: "Filter Design Calculator", description: "Calculate RC time constant for first-order active filter design", parameters: { fc: { type: "number", description: "Cutoff frequency (Hz)", required: true } }, category: "engineering", execute: async (a) => ElectricalEngineering.filterDesign(a.fc) },
  { id: "x_eng_power_factor", name: "Power Factor Correction", description: "Calculate required capacitor kVAR to improve power factor from pf1 to pf2", parameters: { P: { type: "number", description: "Real power (kW)", required: true }, pf1: { type: "number", description: "Current power factor", required: true }, pf2: { type: "number", description: "Target power factor", required: true } }, category: "engineering", execute: async (a) => ElectricalEngineering.powerFactorCorrection(a.P, a.pf1, a.pf2) },

  // ══════════════════════════════════════════════════════════════════════════════════════
  // MISSING EXTENDED FINANCE TOOLS (3 tools)
  // ══════════════════════════════════════════════════════════════════════════════════════
  { id: "x_fin_annuity", name: "Annuity Calculator", description: "Calculate present value and total payments for an ordinary annuity stream", parameters: { PMT: { type: "number", description: "Payment per period", required: true }, r: { type: "number", description: "Interest rate per period", required: true }, n: { type: "number", description: "Number of periods", required: true } }, category: "finance", execute: async (a) => FinancialCalculations.annuity(a.PMT, a.r, a.n) },
  { id: "x_fin_dividend_discount", name: "Dividend Discount Model", description: "Value a stock using the Gordon Growth dividend discount model", parameters: { D1: { type: "number", description: "Next year's expected dividend", required: true }, r: { type: "number", description: "Required rate of return", required: true }, g: { type: "number", description: "Dividend growth rate", required: true } }, category: "finance", execute: async (a) => FinancialCalculations.dividendDiscountModel(a.D1, a.r, a.g) },
  { id: "x_fin_beta", name: "Stock Beta Calculator", description: "Calculate beta coefficient measuring stock volatility relative to the market", parameters: { stockReturns: { type: "string", description: "JSON array of stock returns", required: true }, marketReturns: { type: "string", description: "JSON array of market returns", required: true } }, category: "finance", execute: async (a) => FinancialCalculations.beta(JSON.parse(a.stockReturns), JSON.parse(a.marketReturns)) },

  // ══════════════════════════════════════════════════════════════════════════════════════
  // MISSING EXTENDED DATA SCIENCE TOOLS (6 tools)
  // ══════════════════════════════════════════════════════════════════════════════════════
  { id: "x_ds_standardize", name: "Data Standardizer", description: "Z-score standardize a dataset to zero mean and unit variance for ML preprocessing", parameters: { data: { type: "string", description: "JSON array of numbers", required: true } }, category: "data-science", execute: async (a) => DataScience.standardize(JSON.parse(a.data)) },
  { id: "x_ds_gradient_descent", name: "Gradient Descent Optimizer", description: "Find function minimum using gradient descent with configurable learning rate", parameters: { functionStr: { type: "string", description: "JS function expression like 'x => x**2'", required: true }, x0: { type: "number", description: "Initial guess", required: true }, lr: { type: "number", description: "Learning rate", required: true }, iterations: { type: "number", description: "Max iterations", required: true } }, category: "data-science", execute: async (a) => { const f = new Function("return " + a.functionStr)(); return DataScience.gradientDescent(f, a.x0, a.lr, a.iterations); } },
  { id: "x_ds_confusion_matrix", name: "Confusion Matrix Calculator", description: "Generate confusion matrix and accuracy from predicted vs actual labels for model evaluation", parameters: { predicted: { type: "string", description: "JSON array of predicted labels", required: true }, actual: { type: "string", description: "JSON array of actual labels", required: true } }, category: "data-science", execute: async (a) => DataScience.confusionMatrix(JSON.parse(a.predicted), JSON.parse(a.actual)) },
  { id: "x_ds_tfidf", name: "TF-IDF Calculator", description: "Calculate Term Frequency-Inverse Document Frequency score for text mining and information retrieval", parameters: { termFreq: { type: "number", description: "Term frequency in document", required: true }, docFreq: { type: "number", description: "Number of documents containing term", required: true }, totalDocs: { type: "number", description: "Total number of documents", required: true } }, category: "data-science", execute: async (a) => DataScience.tfidf(a.termFreq, a.docFreq, a.totalDocs) },
  { id: "x_ds_monte_carlo", name: "Monte Carlo Integration", description: "Estimate definite integrals using Monte Carlo random sampling for complex functions", parameters: { functionStr: { type: "string", description: "JS function expression", required: true }, a: { type: "number", description: "Lower bound", required: true }, b: { type: "number", description: "Upper bound", required: true }, n: { type: "number", description: "Number of random samples", required: true } }, category: "data-science", execute: async (a) => { const f = new Function("return " + a.functionStr)(); return DataScience.monteCarloIntegration(f, a.a, a.b, a.n); } },
  { id: "x_ds_multi_regression", name: "Multiple Linear Regression", description: "Fit multiple linear regression model coefficients using matrix algebra for multi-variable prediction", parameters: { X: { type: "string", description: "JSON 2D array of feature matrix", required: true }, y: { type: "string", description: "JSON array of target values", required: true } }, category: "data-science", execute: async (a) => DataScience.linearRegressionMultiple(JSON.parse(a.X), JSON.parse(a.y)) },

  // ══════════════════════════════════════════════════════════════════════════════════════
  // MISSING EXTENDED SECURITY TOOLS (3 tools)
  // ══════════════════════════════════════════════════════════════════════════════════════
  { id: "x_sec_firewall", name: "Firewall Rule Analyzer", description: "Analyze firewall ruleset for coverage, conflicts, and security posture assessment", parameters: { rules: { type: "string", description: "JSON array of {action, port, protocol} rule objects", required: true } }, category: "security", execute: async (a) => SecurityTools.firewallRules(JSON.parse(a.rules)) },
  { id: "x_sec_malware_sig", name: "Malware Signature Detector", description: "Identify file type and detect suspicious signatures from binary header analysis", parameters: { data: { type: "string", description: "Hex string of file header (first 8+ bytes)", required: true } }, category: "security", execute: async (a) => SecurityTools.malwareSignature(a.data) },
  { id: "x_sec_port_scan", name: "Port Scanner", description: "Scan target host ports and identify running services by port number mapping", parameters: { host: { type: "string", description: "Target hostname or IP", required: true }, ports: { type: "string", description: "JSON array of port numbers to scan", required: true } }, category: "security", execute: async (a) => SecurityTools.portScan(a.host, JSON.parse(a.ports)) },

  // ══════════════════════════════════════════════════════════════════════════════════════
  // MISSING EXTENDED DAILY LIFE TOOLS (6 tools)
  // ══════════════════════════════════════════════════════════════════════════════════════
  { id: "x_life_savings_goal", name: "Savings Goal Planner", description: "Calculate months needed to reach a savings goal with regular contributions and compound interest", parameters: { target: { type: "number", description: "Target savings amount", required: true }, monthly: { type: "number", description: "Monthly contribution", required: true }, annualRate: { type: "number", description: "Annual interest rate (decimal)", required: true } }, category: "daily-life", execute: async (a) => DailyLifeTools.savingsGoal(a.target, a.monthly, a.annualRate) },
  { id: "x_life_pace", name: "Running Pace Calculator", description: "Calculate running pace per km and speed from distance and time for marathon training", parameters: { distanceKm: { type: "number", description: "Distance in kilometers", required: true }, timeMinutes: { type: "number", description: "Time in minutes", required: true } }, category: "daily-life", execute: async (a) => DailyLifeTools.paceCalculator(a.distanceKm, a.timeMinutes) },
  { id: "x_life_aspect_ratio", name: "Aspect Ratio Calculator", description: "Calculate and simplify screen aspect ratio from width and height dimensions", parameters: { width: { type: "number", description: "Width in pixels", required: true }, height: { type: "number", description: "Height in pixels", required: true } }, category: "daily-life", execute: async (a) => DailyLifeTools.aspectRatio(a.width, a.height) },
  { id: "x_life_color", name: "Color Converter", description: "Convert hex color codes to RGB values and calculate luminance for web design", parameters: { hex: { type: "string", description: "Hex color like #FF5733", required: true } }, category: "daily-life", execute: async (a) => DailyLifeTools.colorConverter(a.hex) },
  { id: "x_life_pixel_rem", name: "Pixel to REM Converter", description: "Convert pixel values to REM units for responsive CSS design", parameters: { px: { type: "number", description: "Pixel value to convert", required: true }, base: { type: "number", description: "Base font size in px (default 16)" } }, category: "daily-life", execute: async (a) => DailyLifeTools.pixelToRem(a.px, a.base) },
  { id: "x_life_wind_chill", name: "Wind Chill Calculator", description: "Calculate apparent temperature from wind chill factor for cold weather safety", parameters: { tempC: { type: "number", description: "Air temperature in Celsius", required: true }, windSpeedKmh: { type: "number", description: "Wind speed in km/h", required: true } }, category: "daily-life", execute: async (a) => DailyLifeTools.windChill(a.tempC, a.windSpeedKmh) },

  // ══════════════════════════════════════════════════════════════════════════════════════
  // VEHICLE CONTROL SYSTEM (27 tools) — Drones, Cars, Boats, Rockets, Satellites
  // ══════════════════════════════════════════════════════════════════════════════════════
  { id: "x_veh_drone_connect", name: "Drone Connect", description: "Establish WebSocket connection to MAVLink proxy for real-time drone telemetry and control", parameters: { url: { type: "string", description: "WebSocket URL (ws://host:port)", required: true } }, category: "vehicles", execute: async (a) => { const d = new DroneController(); const ok = await d.connect(a.url); return { ok, data: { connected: ok } }; } },
  { id: "x_veh_drone_arm", name: "Drone Arm", description: "Arm drone motors and prepare for takeoff via MAVLink command", parameters: {}, category: "vehicles", execute: async () => { const d = new DroneController(); return { ok: true, data: { armed: await d.arm() } }; } },
  { id: "x_veh_drone_disarm", name: "Drone Disarm", description: "Disarm drone motors for safe landing or shutdown via MAVLink command", parameters: {}, category: "vehicles", execute: async () => { const d = new DroneController(); return { ok: true, data: { disarmed: await d.disarm() } }; } },
  { id: "x_veh_drone_takeoff", name: "Drone Takeoff", description: "Command drone to takeoff to specified altitude in guided mode", parameters: { alt: { type: "number", description: "Target altitude in meters (default 10)", required: false } }, category: "vehicles", execute: async (a) => { const d = new DroneController(); return { ok: true, data: { takeoff: await d.takeoff(a.alt || 10) } }; } },
  { id: "x_veh_drone_land", name: "Drone Land", description: "Command drone to initiate autonomous landing sequence at current position", parameters: {}, category: "vehicles", execute: async () => { const d = new DroneController(); return { ok: true, data: { landing: await d.land() } }; } },
  { id: "x_veh_drone_rtl", name: "Drone Return to Launch", description: "Command drone to return to launch point and land automatically via RTL mode", parameters: {}, category: "vehicles", execute: async () => { const d = new DroneController(); return { ok: true, data: { rtl: await d.returnToLaunch() } }; } },
  { id: "x_veh_drone_mode", name: "Drone Set Mode", description: "Change flight mode (STABILIZE, AUTO, GUIDED, LOITER, RTL, LAND, etc.)", parameters: { mode: { type: "string", description: "Flight mode: STABILIZE|ACRO|ALT_HOLD|AUTO|GUIDED|LOITER|RTL|CIRCLE|LAND|POSHOLD|BRAKE", required: true } }, category: "vehicles", execute: async (a) => { const d = new DroneController(); return { ok: true, data: { modeSet: await d.setMode(a.mode) } }; } },
  { id: "x_veh_drone_speed", name: "Drone Set Speed", description: "Set drone airspeed in meters per second for current flight mode", parameters: { ms: { type: "number", description: "Target speed in m/s", required: true } }, category: "vehicles", execute: async (a) => { const d = new DroneController(); return { ok: true, data: { speedSet: await d.setSpeed(a.ms) } }; } },
  { id: "x_veh_drone_fly_to", name: "Drone Fly To Position", description: "Command drone to fly to GPS coordinates at specified altitude and speed", parameters: { lat: { type: "number", required: true }, lon: { type: "number", required: true }, alt: { type: "number", required: true }, speed: { type: "number", description: "Speed in m/s (default 5)" } }, category: "vehicles", execute: async (a) => { const d = new DroneController(); return { ok: true, data: { flying: await d.flyTo({ lat: a.lat, lon: a.lon, alt: a.alt }, a.speed) } }; } },
  { id: "x_veh_drone_waypoints", name: "Drone Fly Waypoint Mission", description: "Upload and execute a multi-waypoint autonomous mission with actions and hold times", parameters: { waypoints: { type: "string", description: "JSON array of {lat, lon, alt, speed?, action?, holdTime?}", required: true } }, category: "vehicles", execute: async (a) => { const d = new DroneController(); return { ok: true, data: { missionSent: await d.flyWaypoints(JSON.parse(a.waypoints)) } }; } },
  { id: "x_veh_drone_attitude", name: "Drone Set Attitude", description: "Set drone attitude (roll, pitch, yaw) and thrust for precision maneuvering", parameters: { roll: { type: "number", description: "Roll in degrees", required: true }, pitch: { type: "number", description: "Pitch in degrees", required: true }, yaw: { type: "number", description: "Yaw in degrees", required: true }, thrust: { type: "number", description: "Thrust 0.0-1.0 (default 0.5)" } }, category: "vehicles", execute: async (a) => { const d = new DroneController(); return { ok: true, data: { attitudeSet: await d.setAttitude({ roll: a.roll, pitch: a.pitch, yaw: a.yaw }, a.thrust) } }; } },
  { id: "x_veh_drone_geofence", name: "Drone Set Geofence", description: "Define geofence boundary with center, radius, and max altitude for safety", parameters: { lat: { type: "number", required: true }, lon: { type: "number", required: true }, alt: { type: "number", required: true }, radiusM: { type: "number", description: "Fence radius in meters", required: true }, maxHeight: { type: "number", description: "Maximum altitude in meters", required: true } }, category: "vehicles", execute: async (a) => { const d = new DroneController(); return { ok: true, data: { geofenceSet: await d.setGeofence({ lat: a.lat, lon: a.lon, alt: a.alt }, a.radiusM, a.maxHeight) } }; } },
  { id: "x_veh_drone_emergency", name: "Drone Emergency Stop", description: "Immediately brake and disarm drone for emergency situations", parameters: {}, category: "vehicles", execute: async () => { const d = new DroneController(); return { ok: true, data: { emergencyStop: await d.emergencyStop() } }; } },

  { id: "x_veh_car_connect", name: "Car Connect", description: "Establish WebSocket connection to OBD-II adapter for real-time vehicle diagnostics", parameters: { url: { type: "string", description: "WebSocket URL to OBD-II adapter", required: true } }, category: "vehicles", execute: async (a) => { const c = new CarController(); const ok = await c.connect(a.url); return { ok, data: { connected: ok } }; } },
  { id: "x_veh_car_rpm", name: "Car Get RPM", description: "Read engine RPM via OBD-II protocol for performance monitoring", parameters: {}, category: "vehicles", execute: async () => { const c = new CarController(); return { ok: true, data: { rpm: await c.getRPM() } }; } },
  { id: "x_veh_car_speed", name: "Car Get Speed", description: "Read vehicle speed via OBD-II protocol in real-time", parameters: {}, category: "vehicles", execute: async () => { const c = new CarController(); return { ok: true, data: { speed: await c.getSpeed() } }; } },
  { id: "x_veh_car_fuel", name: "Car Get Fuel Level", description: "Read fuel tank level percentage via OBD-II protocol", parameters: {}, category: "vehicles", execute: async () => { const c = new CarController(); return { ok: true, data: { fuelLevel: await c.getFuelLevel() } }; } },
  { id: "x_veh_car_dtcs", name: "Car Read DTCs", description: "Read Diagnostic Trouble Codes from vehicle ECU for fault diagnosis", parameters: {}, category: "vehicles", execute: async () => { const c = new CarController(); return { ok: true, data: { dtcCodes: await c.readDTCs() } }; } },
  { id: "x_veh_car_clear_dtcs", name: "Car Clear DTCs", description: "Clear all Diagnostic Trouble Codes and reset check engine light", parameters: {}, category: "vehicles", execute: async () => { const c = new CarController(); return { ok: true, data: { cleared: await c.clearDTCs() } }; } },
  { id: "x_veh_car_lock", name: "Car Lock Doors", description: "Lock all vehicle doors via CAN bus command", parameters: {}, category: "vehicles", execute: async () => { const c = new CarController(); return { ok: true, data: { locked: await c.lockDoors() } }; } },
  { id: "x_veh_car_unlock", name: "Car Unlock Doors", description: "Unlock all vehicle doors via CAN bus command", parameters: {}, category: "vehicles", execute: async () => { const c = new CarController(); return { ok: true, data: { unlocked: await c.unlockDoors() } }; } },
  { id: "x_veh_car_lights", name: "Car Flash Lights", description: "Flash vehicle lights via CAN bus for visual signaling", parameters: {}, category: "vehicles", execute: async () => { const c = new CarController(); return { ok: true, data: { flashed: await c.flashLights() } }; } },
  { id: "x_veh_car_horn", name: "Car Honk Horn", description: "Activate vehicle horn for specified duration via CAN bus", parameters: { ms: { type: "number", description: "Duration in milliseconds (default 500)", required: false } }, category: "vehicles", execute: async (a) => { const c = new CarController(); return { ok: true, data: { honked: await c.honkHorn(a.ms) } }; } },
  { id: "x_veh_car_start", name: "Car Start Engine", description: "Start vehicle engine via CAN bus remote start command", parameters: {}, category: "vehicles", execute: async () => { const c = new CarController(); return { ok: true, data: { started: await c.startEngine() } }; } },
  { id: "x_veh_car_stop", name: "Car Stop Engine", description: "Stop vehicle engine via CAN bus command", parameters: {}, category: "vehicles", execute: async () => { const c = new CarController(); return { ok: true, data: { stopped: await c.stopEngine() } }; } },
  { id: "x_veh_car_climate", name: "Car Set Climate", description: "Set vehicle climate control temperature via CAN bus", parameters: { tempC: { type: "number", description: "Target temperature in Celsius", required: true } }, category: "vehicles", execute: async (a) => { const c = new CarController(); return { ok: true, data: { climateSet: await c.setClimate(a.tempC) } }; } },

  { id: "x_veh_boat_connect", name: "Boat Connect", description: "Establish WebSocket connection to marine autopilot for boat control", parameters: { url: { type: "string", description: "WebSocket URL to marine controller", required: true } }, category: "vehicles", execute: async (a) => { const b = new BoatController(); const ok = await b.connect(a.url); return { ok, data: { connected: ok } }; } },
  { id: "x_veh_boat_heading", name: "Boat Set Heading", description: "Set boat compass heading in degrees for autopilot navigation", parameters: { degrees: { type: "number", description: "Target heading (0-360)", required: true } }, category: "vehicles", execute: async (a) => { const b = new BoatController(); return { ok: true, data: { headingSet: await b.setHeading(a.degrees) } }; } },
  { id: "x_veh_boat_throttle", name: "Boat Set Throttle", description: "Set boat engine throttle percentage (0-100) for speed control", parameters: { percent: { type: "number", description: "Throttle percentage (0-100)", required: true } }, category: "vehicles", execute: async (a) => { const b = new BoatController(); return { ok: true, data: { throttleSet: await b.setThrottle(a.percent) } }; } },
  { id: "x_veh_boat_navigate", name: "Boat Navigate To", description: "Command boat to navigate to GPS coordinates via autopilot", parameters: { lat: { type: "number", required: true }, lon: { type: "number", required: true } }, category: "vehicles", execute: async (a) => { const b = new BoatController(); return { ok: true, data: { navigating: await b.navigateTo(a.lat, a.lon) } }; } },
  { id: "x_veh_boat_emergency", name: "Boat Emergency Stop", description: "Immediately cut throttle to zero for emergency situations", parameters: {}, category: "vehicles", execute: async () => { const b = new BoatController(); return { ok: true, data: { emergencyStop: await b.emergencyStop() } }; } },

  { id: "x_veh_rocket_connect", name: "Rocket Connect", description: "Establish WebSocket connection to rocket flight computer for telemetry and control", parameters: { url: { type: "string", description: "WebSocket URL to rocket controller", required: true } }, category: "vehicles", execute: async (a) => { const r = new RocketController(); const ok = await r.connect(a.url); return { ok, data: { connected: ok } }; } },
  { id: "x_veh_rocket_countdown", name: "Rocket Start Countdown", description: "Initiate launch countdown sequence with configurable timer", parameters: { seconds: { type: "number", description: "Countdown duration in seconds (default 10)", required: false } }, category: "vehicles", execute: async (a) => { const r = new RocketController(); return { ok: true, data: { countdownStarted: await r.startCountdown(a.seconds || 10) } }; } },
  { id: "x_veh_rocket_launch", name: "Rocket Launch", description: "Execute rocket launch — ignite engines and begin powered flight", parameters: {}, category: "vehicles", execute: async () => { const r = new RocketController(); return { ok: true, data: { launched: await r.launch() } }; } },
  { id: "x_veh_rocket_trajectory", name: "Rocket Set Trajectory", description: "Set pitch and yaw angles for trajectory control during powered flight", parameters: { pitch: { type: "number", description: "Pitch angle in degrees", required: true }, yaw: { type: "number", description: "Yaw angle in degrees", required: true } }, category: "vehicles", execute: async (a) => { const r = new RocketController(); return { ok: true, data: { trajectorySet: await r.setTrajectory(a.pitch, a.yaw) } }; } },
  { id: "x_veh_rocket_stage", name: "Rocket Stage Separation", description: "Trigger stage separation at specified stage number during flight", parameters: { stage: { type: "number", description: "Stage number to separate", required: true } }, category: "vehicles", execute: async (a) => { const r = new RocketController(); return { ok: true, data: { separated: await r.stageSeparation(a.stage) } }; } },
  { id: "x_veh_rocket_fairing", name: "Rocket Deploy Fairing", description: "Deploy payload fairing after leaving atmosphere", parameters: {}, category: "vehicles", execute: async () => { const r = new RocketController(); return { ok: true, data: { fairingDeployed: await r.activateFairing() } }; } },
  { id: "x_veh_rocket_payload", name: "Rocket Deploy Payload", description: "Deploy satellite or payload into target orbit", parameters: {}, category: "vehicles", execute: async () => { const r = new RocketController(); return { ok: true, data: { payloadDeployed: await r.deployPayload() } }; } },
  { id: "x_veh_rocket_abort", name: "Rocket Abort", description: "Activate emergency abort sequence to terminate flight safely", parameters: {}, category: "vehicles", execute: async () => { const r = new RocketController(); return { ok: true, data: { aborted: await r.abort() } }; } },
  { id: "x_veh_rocket_throttle", name: "Rocket Set Throttle", description: "Set engine throttle percentage (0-100) for thrust control", parameters: { percent: { type: "number", description: "Throttle percentage (0-100)", required: true } }, category: "vehicles", execute: async (a) => { const r = new RocketController(); return { ok: true, data: { throttleSet: await r.setThrottle(a.percent) } }; } },
  { id: "x_veh_rocket_engine", name: "Rocket Engine Control", description: "Start or stop individual rocket engines by ID for multi-engine vehicles", parameters: { engineId: { type: "number", description: "Engine ID number", required: true }, action: { type: "string", description: "start|stop", required: true } }, category: "vehicles", execute: async (a) => { const r = new RocketController(); if (a.action === "start") return { ok: true, data: { engineStarted: await r.activateEngine(a.engineId) } }; return { ok: true, data: { engineStopped: await r.shutdownEngine(a.engineId) } }; } },

  { id: "x_veh_sat_connect", name: "Satellite Connect", description: "Establish WebSocket connection to satellite bus for telemetry and commanding", parameters: { url: { type: "string", description: "WebSocket URL to satellite controller", required: true } }, category: "vehicles", execute: async (a) => { const s = new SatelliteController(); const ok = await s.connect(a.url); return { ok, data: { connected: ok } }; } },
  { id: "x_veh_sat_attitude", name: "Satellite Set Attitude", description: "Set satellite attitude (roll, pitch, yaw) for antenna pointing or imaging", parameters: { roll: { type: "number", required: true }, pitch: { type: "number", required: true }, yaw: { type: "number", required: true } }, category: "vehicles", execute: async (a) => { const s = new SatelliteController(); return { ok: true, data: { attitudeSet: await s.setAttitude(a.roll, a.pitch, a.yaw) } }; } },
  { id: "x_veh_sat_thruster", name: "Satellite Fire Thruster", description: "Fire reaction control thruster on specified axis for attitude adjustment", parameters: { axis: { type: "string", description: "x|y|z", required: true }, durationMs: { type: "number", description: "Burn duration in milliseconds", required: true }, direction: { type: "number", description: "1 or -1", required: true } }, category: "vehicles", execute: async (a) => { const s = new SatelliteController(); return { ok: true, data: { thrusterFired: await s.fireThruster(a.axis, a.durationMs, a.direction) } }; } },
  { id: "x_veh_sat_orbit", name: "Satellite Adjust Orbit", description: "Adjust orbital parameters (altitude, inclination, eccentricity, etc.)", parameters: { params: { type: "string", description: "JSON with orbit parameters: altitude, inclination, eccentricity, raan, argPerigee, trueAnomaly", required: true } }, category: "vehicles", execute: async (a) => { const s = new SatelliteController(); return { ok: true, data: { orbitAdjusted: await s.adjustOrbit(JSON.parse(a.params)) } }; } },
  { id: "x_veh_sat_solar", name: "Satellite Deploy Solar Panels", description: "Deploy solar panel arrays for power generation", parameters: {}, category: "vehicles", execute: async () => { const s = new SatelliteController(); return { ok: true, data: { solarDeployed: await s.deploySolarPanels() } }; } },
  { id: "x_veh_sat_antenna", name: "Satellite Point Antenna", description: "Point communication antenna to ground station using azimuth and elevation", parameters: { azimuth: { type: "number", description: "Azimuth angle in degrees", required: true }, elevation: { type: "number", description: "Elevation angle in degrees", required: true } }, category: "vehicles", execute: async (a) => { const s = new SatelliteController(); return { ok: true, data: { antennaPointed: await s.pointAntenna(a.azimuth, a.elevation) } }; } },
  { id: "x_veh_sat_camera", name: "Satellite Take Picture", description: "Capture image using satellite camera in specified spectral band", parameters: { band: { type: "string", description: "Spectral band: visible|infrared|multispectral (default visible)", required: false } }, category: "vehicles", execute: async (a) => { const s = new SatelliteController(); return { ok: true, data: { imageCaptured: await s.takePicture(a.band) } }; } },
  { id: "x_veh_sat_safemode", name: "Satellite Enter Safe Mode", description: "Enter safe mode to protect satellite during anomalies or low power", parameters: {}, category: "vehicles", execute: async () => { const s = new SatelliteController(); return { ok: true, data: { safeMode: await s.enterSafeMode() } }; } },
  { id: "x_veh_sat_deorbit", name: "Satellite Activate Deorbit", description: "Initiate deorbit burn for controlled re-entry and disposal", parameters: {}, category: "vehicles", execute: async () => { const s = new SatelliteController(); return { ok: true, data: { deorbitActivated: await s.activateDeorbit() } }; } },

  { id: "x_veh_fleet_create_drone", name: "Create Drone in Fleet", description: "Register a new drone in the master vehicle fleet for centralized management", parameters: { id: { type: "string", description: "Unique drone identifier", required: true } }, category: "vehicles", execute: async (a) => { const fleet = new ZyraxonVehicles(); fleet.createDrone(a.id); return { ok: true, data: { droneId: a.id, fleetSize: fleet.drones.size } }; } },
  { id: "x_veh_fleet_create_car", name: "Create Car in Fleet", description: "Register a new car in the master vehicle fleet for centralized management", parameters: { id: { type: "string", description: "Unique car identifier", required: true } }, category: "vehicles", execute: async (a) => { const fleet = new ZyraxonVehicles(); fleet.createCar(a.id); return { ok: true, data: { carId: a.id, fleetSize: fleet.cars.size } }; } },
  { id: "x_veh_fleet_create_rocket", name: "Create Rocket in Fleet", description: "Register a new rocket in the master vehicle fleet for centralized management", parameters: { id: { type: "string", description: "Unique rocket identifier", required: true } }, category: "vehicles", execute: async (a) => { const fleet = new ZyraxonVehicles(); fleet.createRocket(a.id); return { ok: true, data: { rocketId: a.id, fleetSize: fleet.rockets.size } }; } },
  { id: "x_veh_fleet_telemetry", name: "Get Fleet Telemetry", description: "Get combined telemetry from all vehicles in the fleet simultaneously", parameters: {}, category: "vehicles", execute: async () => { const fleet = new ZyraxonVehicles(); return { ok: true, data: fleet.getAllTelemetry() }; } },
  { id: "x_veh_fleet_emergency_stop", name: "Emergency Stop All Vehicles", description: "Immediately stop all vehicles in the fleet for emergency situations", parameters: {}, category: "vehicles", execute: async () => { const fleet = new ZyraxonVehicles(); fleet.emergencyStopAll(); return { ok: true, data: { allStopped: true } }; } },
  { id: "x_veh_fleet_disconnect", name: "Disconnect All Vehicles", description: "Disconnect all vehicles from the fleet and close WebSocket connections", parameters: {}, category: "vehicles", execute: async () => { const fleet = new ZyraxonVehicles(); fleet.disconnectAll(); return { ok: true, data: { allDisconnected: true } }; } },

  // ══════════════════════════════════════════════════════════════════════════════════════
  // UNIVERSAL COMMAND ENGINE (5 tools) — Natural language command processing
  // ══════════════════════════════════════════════════════════════════════════════════════
  { id: "x_uce_process", name: "Universal Command Process", description: "Process any natural language command and execute it across IoT, vehicles, robotics, software, and hardware domains", parameters: { command: { type: "string", description: "Natural language command to process", required: true } }, category: "universal-command", execute: async (a) => { const uce = new UniversalCommandEngine(); return uce.processCommand(a.command); } },
  { id: "x_uce_devices", name: "List UCE Devices", description: "List all registered devices and their capabilities in the Universal Command Engine", parameters: {}, category: "universal-command", execute: async () => { const uce = new UniversalCommandEngine(); return { ok: true, data: uce.getDevices() }; } },
  { id: "x_uce_history", name: "UCE Command History", description: "Get the last 50 processed commands with their results and execution times", parameters: {}, category: "universal-command", execute: async () => { const uce = new UniversalCommandEngine(); return { ok: true, data: uce.getHistory() }; } },
  { id: "x_uce_context", name: "UCE Get Context", description: "Get current context state of the Universal Command Engine", parameters: {}, category: "universal-command", execute: async () => { const uce = new UniversalCommandEngine(); return { ok: true, data: uce.getContext() }; } },
  { id: "x_uce_register_device", name: "UCE Register Device", description: "Register a new device (IoT, robot, vehicle, sensor) with the Universal Command Engine", parameters: { id: { type: "string", description: "Unique device identifier", required: true }, type: { type: "string", description: "Device type (computer, browser, camera, etc.)", required: true }, capabilities: { type: "string", description: "JSON array of capability strings", required: true }, protocols: { type: "string", description: "JSON array of protocol strings", required: true } }, category: "universal-command", execute: async (a) => { const uce = new UniversalCommandEngine(); uce.registerDevice({ id: a.id, type: a.type, capabilities: JSON.parse(a.capabilities), protocols: JSON.parse(a.protocols), status: "online", lastSeen: Date.now() }); return { ok: true, data: { registered: a.id } }; } },

  // ══════════════════════════════════════════════════════════════════════════════════════
  // CDP + COMPUTER + PLANNING + MEDIA + SELF-IMPROVE TOOLS
  // Real implementations from advanced-tools.ts (NOT stubs)
  // ══════════════════════════════════════════════════════════════════════════════════════
  ...cdpBrowserTools,
  ...computerControlTools,
  ...planningTools,
  ...mediaTools,
  ...selfImproveTools,

  // ══════════════════════════════════════════════════════════════════════════════
  // MCP TOOL FALLBACKS — Nuphus Desktop + Touchpoint Accessibility
  // AI knows these tools exist even if MCP servers fail to connect
  // When MCP connects, real MCP tools take over automatically
  // ══════════════════════════════════════════════════════════════════════════════
  ...nuphusMcpTools,
  ...touchpointMcpTools,

  // ═══════════════════════════════════════════════════════════════════════════
  // EXTENDED DOMAIN TOOLS V2 (120 tools) — Astronomy, Geology, Meteorology,
  // Oceanography, Materials, Linguistics, Music, Games, Blockchain, Networking,
  // DevOps, Database — ALL real implementations
  // ═══════════════════════════════════════════════════════════════════════════

  // ASTRONOMY (10 tools)
  { id: "x_astro_orbital_period", name: "Orbital Period Calculator", description: "Calculate orbital period using Kepler's Third Law: T² = (4π²/GM) * a³", parameters: { semiMajorAxisM: { type: "number", description: "Semi-major axis in meters", required: true }, centralMassKg: { type: "number", description: "Central body mass in kg", required: true } }, category: "astronomy", execute: async (a) => ({ ok: true, data: { periodSeconds: AstronomyTools.orbitalPeriod(a.semiMajorAxisM, a.centralMassKg) } }) },
  { id: "x_astro_gravity", name: "Gravitational Force", description: "Calculate gravitational force between two masses: F = G*m1*m2/r²", parameters: { mass1Kg: { type: "number", description: "Mass 1 in kg", required: true }, mass2Kg: { type: "number", description: "Mass 2 in kg", required: true }, distanceM: { type: "number", description: "Distance in meters", required: true } }, category: "astronomy", execute: async (a) => ({ ok: true, data: { forceNewtons: AstronomyTools.gravitationalForce(a.mass1Kg, a.mass2Kg, a.distanceM) } }) },
  { id: "x_astro_escape_vel", name: "Escape Velocity", description: "Calculate escape velocity from a body: v = sqrt(2GM/r)", parameters: { massKg: { type: "number", description: "Body mass in kg", required: true }, radiusM: { type: "number", description: "Body radius in meters", required: true } }, category: "astronomy", execute: async (a) => ({ ok: true, data: { escapeVelocityMs: AstronomyTools.escapeVelocity(a.massKg, a.radiusM) } }) },
  { id: "x_astro_luminosity", name: "Stellar Luminosity", description: "Calculate stellar luminosity from radius and temperature (Stefan-Boltzmann: L = 4πR²σT⁴)", parameters: { radiusM: { type: "number", description: "Stellar radius in meters", required: true }, temperatureK: { type: "number", description: "Surface temperature in Kelvin", required: true } }, category: "astronomy", execute: async (a) => ({ ok: true, data: { luminosityWatts: AstronomyTools.stellarLuminosity(a.radiusM, a.temperatureK) } }) },
  { id: "x_astro_parallax", name: "Distance from Parallax", description: "Calculate distance in parsecs from parallax angle in arcseconds", parameters: { parallaxArcsec: { type: "number", description: "Parallax angle in arcseconds", required: true } }, category: "astronomy", execute: async (a) => ({ ok: true, data: { distanceParsecs: AstronomyTools.distanceFromParallax(a.parallaxArcsec) } }) },
  { id: "x_astro_angular_sep", name: "Angular Separation", description: "Calculate angular separation between two sky coordinates", parameters: { ra1Deg: { type: "number", description: "RA1 in degrees", required: true }, dec1Deg: { type: "number", description: "Dec1 in degrees", required: true }, ra2Deg: { type: "number", description: "RA2 in degrees", required: true }, dec2Deg: { type: "number", description: "Dec2 in degrees", required: true } }, category: "astronomy", execute: async (a) => ({ ok: true, data: { separationDegrees: AstronomyTools.angularSeparation(a.ra1Deg, a.dec1Deg, a.ra2Deg, a.dec2Deg) } }) },
  { id: "x_astro_redshift", name: "Redshift Calculator", description: "Calculate cosmological redshift from recession velocity (relativistic or non-relativistic)", parameters: { velocityMs: { type: "number", description: "Recession velocity in m/s", required: true }, relativistic: { type: "boolean", description: "Use relativistic formula", required: false } }, category: "astronomy", execute: async (a) => ({ ok: true, data: { redshift: AstronomyTools.redshift(a.velocityMs, a.relativistic) } }) },
  { id: "x_astro_habitable_zone", name: "Habitable Zone Calculator", description: "Calculate habitable zone boundaries from stellar luminosity (Kopparapu et al.)", parameters: { luminositySun: { type: "number", description: "Stellar luminosity in solar units", required: true } }, category: "astronomy", execute: async (a) => ({ ok: true, data: AstronomyTools.habitableZone(a.luminositySun) }) },
  { id: "x_astro_julian_date", name: "Julian Date Calculator", description: "Convert calendar date to Julian Date for astronomical calculations", parameters: { year: { type: "number", description: "Year (e.g. 2026)", required: true }, month: { type: "number", description: "Month (1-12)", required: true }, day: { type: "number", description: "Day of month", required: true }, hour: { type: "number", description: "Hour (0-24, default 12)", required: false } }, category: "astronomy", execute: async (a) => ({ ok: true, data: { julianDate: AstronomyTools.julianDate(a.year, a.month, a.day, a.hour) } }) },
  { id: "x_astro_sidereal_time", name: "Sidereal Time Calculator", description: "Calculate Local Sidereal Time from Julian Date and longitude", parameters: { jd: { type: "number", description: "Julian Date", required: true }, longitudeDeg: { type: "number", description: "Observer longitude in degrees", required: true } }, category: "astronomy", execute: async (a) => ({ ok: true, data: { siderealTimeDegrees: AstronomyTools.siderealTime(a.jd, a.longitudeDeg) } }) },

  // GEOLOGY (10 tools)
  { id: "x_geo_mohs", name: "Mohs Hardness Classifier", description: "Classify mineral by Mohs hardness value (1-10)", parameters: { hardness: { type: "number", description: "Mohs hardness (1-10)", required: true } }, category: "geology", execute: async (a) => ({ ok: true, data: { mineral: GeologyTools.classifyMohs(a.hardness) } }) },
  { id: "x_geo_seismic_density", name: "Seismic Density Estimator", description: "Estimate rock density from P-wave velocity using Gardner's relation", parameters: { pWaveVelocityKmS: { type: "number", description: "P-wave velocity in km/s", required: true } }, category: "geology", execute: async (a) => ({ ok: true, data: { densityKgM3: GeologyTools.seismicDensity(a.pWaveVelocityKmS) } }) },
  { id: "x_geo_radiometric", name: "Radiometric Dating", description: "Calculate rock age from parent/daughter ratio and half-life", parameters: { ratioN_N0: { type: "number", description: "Ratio of remaining parent isotope (0-1)", required: true }, halfLifeYears: { type: "number", description: "Half-life in years", required: true } }, category: "geology", execute: async (a) => ({ ok: true, data: { ageYears: GeologyTools.radiometricAge(a.ratioN_N0, a.halfLifeYears) } }) },
  { id: "x_geo_rock_type", name: "Rock Type Classifier", description: "Classify rock type from density measurement", parameters: { densityKgM3: { type: "number", description: "Rock density in kg/m³", required: true } }, category: "geology", execute: async (a) => ({ ok: true, data: { rockType: GeologyTools.classifyRock(a.densityKgM3) } }) },
  { id: "x_geo_bearing", name: "Bearing Capacity Calculator", description: "Calculate soil bearing capacity using Terzaghi's method", parameters: { cohesionKpa: { type: "number", description: "Soil cohesion in kPa", required: true }, surchargeKpa: { type: "number", description: "Surcharge load in kPa", required: true }, unitWeightKnm3: { type: "number", description: "Soil unit weight in kN/m³", required: true }, widthM: { type: "number", description: "Foundation width in meters", required: true }, bearingFactorNc: { type: "number", description: "Bearing factor Nc", required: true }, bearingFactorNq: { type: "number", description: "Bearing factor Nq", required: true }, bearingFactorNgamma: { type: "number", description: "Bearing factor Nγ", required: true } }, category: "geology", execute: async (a) => ({ ok: true, data: { bearingCapacityKpa: GeologyTools.bearingCapacity(a.cohesionKpa, a.surchargeKpa, a.unitWeightKnm3, a.widthM, a.bearingFactorNc, a.bearingFactorNq, a.bearingFactorNgamma) } }) },
  { id: "x_geo_porosity", name: "Porosity Calculator", description: "Calculate rock porosity from bulk and grain density", parameters: { bulkDensityKgM3: { type: "number", description: "Bulk density in kg/m³", required: true }, grainDensityKgM3: { type: "number", description: "Grain density in kg/m³", required: true } }, category: "geology", execute: async (a) => ({ ok: true, data: { porosity: GeologyTools.porosity(a.bulkDensityKgM3, a.grainDensityKgM3) } }) },
  { id: "x_geo_permeability", name: "Permeability Estimator", description: "Estimate permeability from grain size and porosity (Kozeny-Carman)", parameters: { grainSizeM: { type: "number", description: "Grain size in meters", required: true }, porosity: { type: "number", description: "Porosity (0-1)", required: true } }, category: "geology", execute: async (a) => ({ ok: true, data: { permeabilityM2: GeologyTools.permeability(a.grainSizeM, a.porosity) } }) },
  { id: "x_geo_geothermal", name: "Geothermal Gradient", description: "Calculate temperature at depth using geothermal gradient", parameters: { surfaceTempC: { type: "number", description: "Surface temperature in °C", required: true }, depthM: { type: "number", description: "Depth in meters", required: true }, gradientCPerKm: { type: "number", description: "Gradient in °C/km (default 25)", required: false } }, category: "geology", execute: async (a) => ({ ok: true, data: { temperatureC: GeologyTools.geothermalGradient(a.surfaceTempC, a.depthM, a.gradientCPerKm) } }) },
  { id: "x_geo_erosion", name: "Erosion Rate Calculator", description: "Estimate soil erosion using USLE (Universal Soil Loss Equation)", parameters: { rFactor: { type: "number", description: "Rainfall erosivity factor", required: true }, kFactor: { type: "number", description: "Soil erodibility factor", required: true }, lFactor: { type: "number", description: "Slope length factor", required: true }, sFactor: { type: "number", description: "Slope steepness factor", required: true }, cFactor: { type: "number", description: "Cover management factor", required: true }, pFactor: { type: "number", description: "Support practice factor", required: true } }, category: "geology", execute: async (a) => ({ ok: true, data: { erosionRate: GeologyTools.erosionRate(a.rFactor, a.kFactor, a.lFactor, a.sFactor, a.cFactor, a.pFactor) } }) },
  { id: "x_geo_plate_velocity", name: "Plate Velocity Calculator", description: "Calculate tectonic plate velocity from magnetic anomaly width and age", parameters: { anomalyWidthKm: { type: "number", description: "Anomaly width in km", required: true }, anomalyAgeMa: { type: "number", description: "Anomaly age in Ma", required: true } }, category: "geology", execute: async (a) => ({ ok: true, data: { velocityKmMa: GeologyTools.plateVelocity(a.anomalyWidthKm, a.anomalyAgeMa) } }) },

  // METEOROLOGY (10 tools)
  { id: "x_meteo_heat_index", name: "Heat Index Calculator", description: "Calculate apparent temperature from heat and humidity (Steadman's formula)", parameters: { temperatureC: { type: "number", description: "Air temperature in °C", required: true }, relativeHumidityPercent: { type: "number", description: "Relative humidity in %", required: true } }, category: "meteorology", execute: async (a) => ({ ok: true, data: { heatIndexC: MeteorologyTools.heatIndex(a.temperatureC, a.relativeHumidityPercent) } }) },
  { id: "x_meteo_wind_chill", name: "Wind Chill Calculator", description: "Calculate wind chill temperature (Environment Canada formula)", parameters: { temperatureC: { type: "number", description: "Air temperature in °C", required: true }, windSpeedKmh: { type: "number", description: "Wind speed in km/h", required: true } }, category: "meteorology", execute: async (a) => ({ ok: true, data: { windChillC: MeteorologyTools.windChill(a.temperatureC, a.windSpeedKmh) } }) },
  { id: "x_meteo_dew_point", name: "Dew Point Calculator", description: "Calculate dew point using Magnus formula", parameters: { temperatureC: { type: "number", description: "Air temperature in °C", required: true }, relativeHumidityPercent: { type: "number", description: "Relative humidity in %", required: true } }, category: "meteorology", execute: async (a) => ({ ok: true, data: { dewPointC: MeteorologyTools.dewPoint(a.temperatureC, a.relativeHumidityPercent) } }) },
  { id: "x_meteo_pressure_alt", name: "Pressure at Altitude", description: "Calculate atmospheric pressure at altitude using barometric formula", parameters: { altitudeM: { type: "number", description: "Altitude in meters", required: true }, seaLevelPressurePa: { type: "number", description: "Sea level pressure in Pa (default 101325)", required: false }, temperatureK: { type: "number", description: "Temperature in K (default 288.15)", required: false } }, category: "meteorology", execute: async (a) => ({ ok: true, data: { pressurePa: MeteorologyTools.pressureAtAltitude(a.altitudeM, a.seaLevelPressurePa, a.temperatureK) } }) },
  { id: "x_meteo_cloud_base", name: "Cloud Base Height", description: "Estimate cloud base height from temperature and dew point", parameters: { temperatureC: { type: "number", description: "Air temperature in °C", required: true }, dewPointC: { type: "number", description: "Dew point in °C", required: true } }, category: "meteorology", execute: async (a) => ({ ok: true, data: { cloudBaseM: MeteorologyTools.cloudBaseHeight(a.temperatureC, a.dewPointC) } }) },
  { id: "x_meteo_visibility", name: "Visibility from Extinction", description: "Calculate visibility from extinction coefficient (Koschmieder equation)", parameters: { extinctionCoeff: { type: "number", description: "Extinction coefficient", required: true } }, category: "meteorology", execute: async (a) => ({ ok: true, data: { visibilityM: MeteorologyTools.visibilityFromExtinction(a.extinctionCoeff) } }) },
  { id: "x_meteo_pet", name: "Potential Evapotranspiration", description: "Calculate PET using Hargreaves equation", parameters: { meanTempC: { type: "number", description: "Mean temperature in °C", required: true }, maxTempC: { type: "number", description: "Max temperature in °C", required: true }, minTempC: { type: "number", description: "Min temperature in °C", required: true }, extraterrestrialRadiationMmDay: { type: "number", description: "Extraterrestrial radiation in mm/day", required: true } }, category: "meteorology", execute: async (a) => ({ ok: true, data: { petMmDay: MeteorologyTools.hargreavesPET(a.meanTempC, a.maxTempC, a.minTempC, a.extraterrestrialRadiationMmDay) } }) },
  { id: "x_meteo_mixing_ratio", name: "Mixing Ratio Calculator", description: "Calculate mixing ratio from saturation vapor pressure and total pressure", parameters: { saturationVaporPressurePa: { type: "number", description: "Saturation vapor pressure in Pa", required: true }, totalPressurePa: { type: "number", description: "Total atmospheric pressure in Pa", required: true } }, category: "meteorology", execute: async (a) => ({ ok: true, data: { mixingRatioKgKg: MeteorologyTools.mixingRatio(a.saturationVaporPressurePa, a.totalPressurePa) } }) },
  { id: "x_meteo_virtual_temp", name: "Virtual Temperature", description: "Calculate virtual temperature correction for moisture", parameters: { temperatureK: { type: "number", description: "Air temperature in Kelvin", required: true }, mixingRatioKgKg: { type: "number", description: "Mixing ratio in kg/kg", required: true } }, category: "meteorology", execute: async (a) => ({ ok: true, data: { virtualTempK: MeteorologyTools.virtualTemperature(a.temperatureK, a.mixingRatioKgKg) } }) },
  { id: "x_meteo_stability", name: "Atmospheric Stability Class", description: "Classify atmospheric stability from lapse rate comparison", parameters: { environmentalLapseRate: { type: "number", description: "Environmental lapse rate in °C/km", required: true }, dryAdiabaticRate: { type: "number", description: "Dry adiabatic rate (default 9.8)", required: false }, moistAdiabaticRate: { type: "number", description: "Moist adiabatic rate (default 5.0)", required: false } }, category: "meteorology", execute: async (a) => ({ ok: true, data: { stability: MeteorologyTools.stabilityClass(a.environmentalLapseRate, a.dryAdiabaticRate, a.moistAdiabaticRate) } }) },

  // OCEANOGRAPHY (10 tools)
  { id: "x_ocean_density", name: "Seawater Density", description: "Calculate seawater density from temperature and salinity (UNESCO simplified)", parameters: { temperatureC: { type: "number", description: "Temperature in °C", required: true }, salinityPpt: { type: "number", description: "Salinity in ppt", required: true } }, category: "oceanography", execute: async (a) => ({ ok: true, data: { densityKgM3: OceanographyTools.seawaterDensity(a.temperatureC, a.salinityPpt) } }) },
  { id: "x_ocean_sound_speed", name: "Sound Speed in Seawater", description: "Calculate sound speed using Mackenzie equation", parameters: { temperatureC: { type: "number", description: "Temperature in °C", required: true }, salinityPpt: { type: "number", description: "Salinity in ppt", required: true }, depthM: { type: "number", description: "Depth in meters", required: true } }, category: "oceanography", execute: async (a) => ({ ok: true, data: { soundSpeedMs: OceanographyTools.soundSpeed(a.temperatureC, a.salinityPpt, a.depthM) } }) },
  { id: "x_ocean_tidal", name: "Tidal Force Calculator", description: "Calculate differential tidal force from moon across Earth", parameters: { moonMassKg: { type: "number", description: "Moon mass in kg", required: true }, distanceM: { type: "number", description: "Moon-Earth distance in meters", required: true }, earthRadiusM: { type: "number", description: "Earth radius in meters", required: true } }, category: "oceanography", execute: async (a) => ({ ok: true, data: { tidalForceN: OceanographyTools.tidalForce(a.moonMassKg, a.distanceM, a.earthRadiusM) } }) },
  { id: "x_ocean_wave_period", name: "Wave Period Calculator", description: "Calculate wave period from wavelength (deep water)", parameters: { wavelengthM: { type: "number", description: "Wavelength in meters", required: true } }, category: "oceanography", execute: async (a) => ({ ok: true, data: { periodSeconds: OceanographyTools.wavePeriod(a.wavelengthM) } }) },
  { id: "x_ocean_wave_speed", name: "Deep Water Wave Speed", description: "Calculate deep water wave speed from period", parameters: { wavePeriodS: { type: "number", description: "Wave period in seconds", required: true } }, category: "oceanography", execute: async (a) => ({ ok: true, data: { speedMs: OceanographyTools.deepWaterWaveSpeed(a.wavePeriodS) } }) },
  { id: "x_ocean_ekman", name: "Ekman Depth Calculator", description: "Calculate Ekman spiral depth from viscosity and latitude", parameters: { kinematicViscosity: { type: "number", description: "Kinematic viscosity", required: true }, latitudeDeg: { type: "number", description: "Latitude in degrees", required: true } }, category: "oceanography", execute: async (a) => ({ ok: true, data: { ekmanDepthM: OceanographyTools.ekmanDepth(a.kinematicViscosity, a.latitudeDeg) } }) },
  { id: "x_ocean_chlorophyll", name: "Chlorophyll from Fluorescence", description: "Convert fluorescence voltage to chlorophyll concentration", parameters: { fluorescenceVolts: { type: "number", description: "Fluorescence reading in volts", required: true }, calibrationSlope: { type: "number", description: "Calibration slope (default 1.0)", required: false }, calibrationOffset: { type: "number", description: "Calibration offset (default 0.0)", required: false } }, category: "oceanography", execute: async (a) => ({ ok: true, data: { chlorophyllUgL: OceanographyTools.chlorophyllFromFluorescence(a.fluorescenceVolts, a.calibrationSlope, a.calibrationOffset) } }) },
  { id: "x_ocean_mixed_layer", name: "Mixed Layer Depth", description: "Find mixed layer depth from temperature profile using threshold method", parameters: { temps: { type: "string", description: "JSON array of temperatures", required: true }, depths: { type: "string", description: "JSON array of depths", required: true }, threshold: { type: "number", description: "Temperature threshold (default 0.5°C)", required: false } }, category: "oceanography", execute: async (a) => ({ ok: true, data: { mixedLayerDepthM: OceanographyTools.mixedLayerDepth(JSON.parse(a.temps), JSON.parse(a.depths), a.threshold) } }) },
  { id: "x_ocean_coriolis", name: "Coriolis Parameter", description: "Calculate Coriolis parameter from latitude", parameters: { latitudeDeg: { type: "number", description: "Latitude in degrees", required: true } }, category: "oceanography", execute: async (a) => ({ ok: true, data: { coriolisParam: OceanographyTools.coriolisParameter(a.latitudeDeg) } }) },
  { id: "x_ocean_rossby", name: "Rossby Number", description: "Calculate Rossby number for geostrophic flow analysis", parameters: { velocityMs: { type: "number", description: "Flow velocity in m/s", required: true }, lengthScaleM: { type: "number", description: "Length scale in meters", required: true }, coriolisParam: { type: "number", description: "Coriolis parameter", required: true } }, category: "oceanography", execute: async (a) => ({ ok: true, data: { rossbyNumber: OceanographyTools.rossbyNumber(a.velocityMs, a.lengthScaleM, a.coriolisParam) } }) },

  // MATERIALS SCIENCE (10 tools)
  { id: "x_mat_youngs", name: "Young's Modulus Calculator", description: "Calculate Young's modulus from stress and strain", parameters: { stressPa: { type: "number", description: "Stress in Pascals", required: true }, strain: { type: "number", description: "Strain (dimensionless)", required: true } }, category: "materials", execute: async (a) => ({ ok: true, data: { youngsModulusPa: MaterialsScienceTools.youngsModulus(a.stressPa, a.strain) } }) },
  { id: "x_mat_shear", name: "Shear Modulus Calculator", description: "Calculate shear modulus from Young's modulus and Poisson's ratio", parameters: { youngsModulusPa: { type: "number", description: "Young's modulus in Pa", required: true }, poissonsRatio: { type: "number", description: "Poisson's ratio", required: true } }, category: "materials", execute: async (a) => ({ ok: true, data: { shearModulusPa: MaterialsScienceTools.shearModulus(a.youngsModulusPa, a.poissonsRatio) } }) },
  { id: "x_mat_bulk", name: "Bulk Modulus Calculator", description: "Calculate bulk modulus from Young's modulus and Poisson's ratio", parameters: { youngsModulusPa: { type: "number", description: "Young's modulus in Pa", required: true }, poissonsRatio: { type: "number", description: "Poisson's ratio", required: true } }, category: "materials", execute: async (a) => ({ ok: true, data: { bulkModulusPa: MaterialsScienceTools.bulkModulus(a.youngsModulusPa, a.poissonsRatio) } }) },
  { id: "x_mat_thermal_expansion", name: "Thermal Expansion Strain", description: "Calculate thermal expansion strain from coefficient and temperature change", parameters: { coeffExpPerK: { type: "number", description: "Coefficient of expansion per K", required: true }, deltaTempK: { type: "number", description: "Temperature change in K", required: true } }, category: "materials", execute: async (a) => ({ ok: true, data: { strain: MaterialsScienceTools.thermalExpansionStrain(a.coeffExpPerK, a.deltaTempK) } }) },
  { id: "x_mat_thermal_stress", name: "Thermal Stress Calculator", description: "Calculate thermal stress in constrained material", parameters: { youngsModulusPa: { type: "number", description: "Young's modulus in Pa", required: true }, coeffExpPerK: { type: "number", description: "Coefficient of expansion per K", required: true }, deltaTempK: { type: "number", description: "Temperature change in K", required: true } }, category: "materials", execute: async (a) => ({ ok: true, data: { thermalStressPa: MaterialsScienceTools.thermalStress(a.youngsModulusPa, a.coeffExpPerK, a.deltaTempK) } }) },
  { id: "x_mat_brinell", name: "Brinell Hardness Calculator", description: "Calculate Brinell hardness from indentation test", parameters: { forceKg: { type: "number", description: "Applied force in kg", required: true }, ballDiameterMm: { type: "number", description: "Ball diameter in mm", required: true }, indentationDiameterMm: { type: "number", description: "Indentation diameter in mm", required: true } }, category: "materials", execute: async (a) => ({ ok: true, data: { brinellHardness: MaterialsScienceTools.brinellHardness(a.forceKg, a.ballDiameterMm, a.indentationDiameterMm) } }) },
  { id: "x_mat_fatigue", name: "Fatigue Life Estimator", description: "Estimate fatigue life using Basquin's equation", parameters: { stressAmplitudePa: { type: "number", description: "Stress amplitude in Pa", required: true }, fatigueStrengthCoeffPa: { type: "number", description: "Fatigue strength coefficient in Pa", required: true }, fatigueStrengthExponent: { type: "number", description: "Fatigue strength exponent (b)", required: true } }, category: "materials", execute: async (a) => ({ ok: true, data: { fatigueLifeCycles: MaterialsScienceTools.fatigueLife(a.stressAmplitudePa, a.fatigueStrengthCoeffPa, a.fatigueStrengthExponent) } }) },
  { id: "x_mat_creep", name: "Creep Rate Calculator", description: "Calculate steady-state creep rate using Norton's law", parameters: { stressPa: { type: "number", description: "Applied stress in Pa", required: true }, constA: { type: "number", description: "Material constant A", required: true }, stressExponent: { type: "number", description: "Stress exponent n", required: true }, activationEnergyJ: { type: "number", description: "Activation energy in J/mol", required: true }, temperatureK: { type: "number", description: "Temperature in Kelvin", required: true } }, category: "materials", execute: async (a) => ({ ok: true, data: { creepRatePerS: MaterialsScienceTools.creepRate(a.stressPa, a.constA, a.stressExponent, a.activationEnergyJ, a.temperatureK) } }) },
  { id: "x_mat_fracture", name: "Stress Intensity Factor", description: "Calculate stress intensity factor for fracture mechanics", parameters: { stressPa: { type: "number", description: "Applied stress in Pa", required: true }, crackLengthM: { type: "number", description: "Crack length in meters", required: true }, geometryFactor: { type: "number", description: "Geometry factor (default 1.12)", required: false } }, category: "materials", execute: async (a) => ({ ok: true, data: { stressIntensityMPaSqrtM: MaterialsScienceTools.stressIntensity(a.stressPa, a.crackLengthM, a.geometryFactor) / 1e6 } }) },
  { id: "x_mat_composite", name: "Composite Modulus Calculator", description: "Calculate composite modulus using rule of mixtures", parameters: { fiberModulusPa: { type: "number", description: "Fiber modulus in Pa", required: true }, matrixModulusPa: { type: "number", description: "Matrix modulus in Pa", required: true }, fiberVolumeFraction: { type: "number", description: "Fiber volume fraction (0-1)", required: true } }, category: "materials", execute: async (a) => ({ ok: true, data: { compositeModulusPa: MaterialsScienceTools.compositeModulus(a.fiberModulusPa, a.matrixModulusPa, a.fiberVolumeFraction) } }) },

  // LINGUISTICS (10 tools)
  { id: "x_ling_entropy", name: "Text Entropy Calculator", description: "Calculate Shannon entropy of text for information content analysis", parameters: { text: { type: "string", description: "Input text to analyze", required: true } }, category: "linguistics", execute: async (a) => ({ ok: true, data: { entropyBits: LinguisticsTools.textEntropy(a.text) } }) },
  { id: "x_ling_ttr", name: "Type-Token Ratio", description: "Calculate lexical diversity using type-token ratio", parameters: { words: { type: "string", description: "JSON array of words", required: true } }, category: "linguistics", execute: async (a) => ({ ok: true, data: { typeTokenRatio: LinguisticsTools.typeTokenRatio(JSON.parse(a.words)) } }) },
  { id: "x_ling_flesch", name: "Flesch-Kincaid Readability", description: "Calculate Flesch-Kincaid reading ease score", parameters: { sentences: { type: "string", description: "JSON array of sentences", required: true }, words: { type: "string", description: "JSON array of words", required: true } }, category: "linguistics", execute: async (a) => ({ ok: true, data: { fleschKincaidEase: LinguisticsTools.fleschKincaidEase(JSON.parse(a.sentences), JSON.parse(a.words)) } }) },
  { id: "x_ling_syllables", name: "Syllable Counter", description: "Count syllables in a word using vowel group approximation", parameters: { word: { type: "string", description: "Word to count syllables", required: true } }, category: "linguistics", execute: async (a) => ({ ok: true, data: { syllableCount: LinguisticsTools.countSyllables(a.word) } }) },
  { id: "x_ling_edit_distance", name: "Edit Distance Calculator", description: "Calculate Levenshtein edit distance between two strings", parameters: { a: { type: "string", description: "First string", required: true }, b: { type: "string", description: "Second string", required: true } }, category: "linguistics", execute: async (a) => ({ ok: true, data: { editDistance: LinguisticsTools.editDistance(a.a, a.b) } }) },
  { id: "x_ling_ngrams", name: "N-gram Frequency Analysis", description: "Calculate n-gram frequency distribution from text", parameters: { text: { type: "string", description: "Input text", required: true }, n: { type: "number", description: "N-gram size (1=unigram, 2=bigram, etc.)", required: true } }, category: "linguistics", execute: async (a) => { const result = LinguisticsTools.ngramFrequency(a.text, a.n); return { ok: true, data: Object.fromEntries(result) }; } },
  { id: "x_ling_tfidf_sim", name: "TF-IDF Document Similarity", description: "Calculate cosine similarity between two documents using TF-IDF", parameters: { doc1: { type: "string", description: "First document", required: true }, doc2: { type: "string", description: "Second document", required: true } }, category: "linguistics", execute: async (a) => ({ ok: true, data: { similarity: LinguisticsTools.tfidfSimilarity(a.doc1, a.doc2) } }) },
  { id: "x_ling_zipf", name: "Zipf's Law Predictor", description: "Predict word frequency from rank using Zipf's law", parameters: { rank: { type: "number", description: "Word rank", required: true }, frequency1: { type: "number", description: "Most frequent word count", required: true } }, category: "linguistics", execute: async (a) => ({ ok: true, data: { predictedFrequency: LinguisticsTools.zipfPrediction(a.rank, a.frequency1) } }) },
  { id: "x_ling_pos", name: "POS Tag Distribution Estimator", description: "Estimate part-of-speech distribution from text using suffix heuristics", parameters: { text: { type: "string", description: "Input text to analyze", required: true } }, category: "linguistics", execute: async (a) => ({ ok: true, data: LinguisticsTools.estimatePosDistribution(a.text) }) },
  { id: "x_ling_morphemes", name: "Morpheme Counter", description: "Estimate morpheme count in a word using prefix/suffix detection", parameters: { word: { type: "string", description: "Word to analyze", required: true } }, category: "linguistics", execute: async (a) => ({ ok: true, data: { morphemeCount: LinguisticsTools.countMorphemes(a.word) } }) },

  // MUSIC THEORY (10 tools)
  { id: "x_music_note_freq", name: "Note to Frequency", description: "Convert note name and octave to frequency (A4 = 440 Hz default)", parameters: { note: { type: "string", description: "Note name (C, C#, D, ..., B)", required: true }, octave: { type: "number", description: "Octave number", required: true }, tuningHz: { type: "number", description: "Tuning frequency (default 440)", required: false } }, category: "music", execute: async (a) => ({ ok: true, data: { frequencyHz: MusicTheoryTools.noteToFrequency(a.note, a.octave, a.tuningHz) } }) },
  { id: "x_music_freq_note", name: "Frequency to Note", description: "Convert frequency to nearest note name, octave, and cents deviation", parameters: { frequency: { type: "number", description: "Frequency in Hz", required: true }, tuningHz: { type: "number", description: "Tuning frequency (default 440)", required: false } }, category: "music", execute: async (a) => ({ ok: true, data: MusicTheoryTools.frequencyToNote(a.frequency, a.tuningHz) }) },
  { id: "x_music_interval", name: "Interval Ratio Calculator", description: "Calculate frequency ratio for a given interval in semitones", parameters: { semitones: { type: "number", description: "Interval in semitones", required: true } }, category: "music", execute: async (a) => ({ ok: true, data: { ratio: MusicTheoryTools.intervalRatio(a.semitones) } }) },
  { id: "x_music_chord", name: "Chord Ratio Calculator", description: "Get frequency ratios for a chord type (just intonation)", parameters: { type: { type: "string", description: "Chord type: major|minor|diminished|augmented|seventh", required: true } }, category: "music", execute: async (a) => ({ ok: true, data: { ratios: MusicTheoryTools.chordRatios(a.type) } }) },
  { id: "x_music_tempo_ms", name: "Tempo to ms/beat", description: "Convert BPM to milliseconds per beat", parameters: { bpm: { type: "number", description: "Beats per minute", required: true } }, category: "music", execute: async (a) => ({ ok: true, data: { msPerBeat: MusicTheoryTools.tempoToMsPerBeat(a.bpm) } }) },
  { id: "x_music_duration_bpm", name: "Duration to BPM", description: "Calculate BPM from duration and number of beats", parameters: { durationMs: { type: "number", description: "Duration in milliseconds", required: true }, beats: { type: "number", description: "Number of beats", required: true } }, category: "music", execute: async (a) => ({ ok: true, data: { bpm: MusicTheoryTools.durationToBpm(a.durationMs, a.beats) } }) },
  { id: "x_music_scale", name: "Scale Frequency Generator", description: "Generate frequencies for a musical scale from root frequency", parameters: { rootFreq: { type: "number", description: "Root frequency in Hz", required: true }, scale: { type: "string", description: "Scale type: major|minor|pentatonic|blues|chromatic", required: true } }, category: "music", execute: async (a) => ({ ok: true, data: { frequencies: MusicTheoryTools.scaleFrequencies(a.rootFreq, a.scale) } }) },
  { id: "x_music_beat_freq", name: "Beat Frequency Calculator", description: "Calculate beat frequency from two tones", parameters: { freq1: { type: "number", description: "First frequency in Hz", required: true }, freq2: { type: "number", description: "Second frequency in Hz", required: true } }, category: "music", execute: async (a) => ({ ok: true, data: { beatFrequencyHz: MusicTheoryTools.beatFrequency(a.freq1, a.freq2) } }) },
  { id: "x_music_doppler", name: "Doppler Shift Calculator", description: "Calculate observed frequency shift from source and observer motion", parameters: { sourceFreq: { type: "number", description: "Source frequency in Hz", required: true }, sourceVelocityMs: { type: "number", description: "Source velocity in m/s", required: true }, observerVelocityMs: { type: "number", description: "Observer velocity in m/s (default 0)", required: false }, speedOfSoundMs: { type: "number", description: "Speed of sound (default 343)", required: false } }, category: "music", execute: async (a) => ({ ok: true, data: { observedFreqHz: MusicTheoryTools.dopplerShift(a.sourceFreq, a.sourceVelocityMs, a.observerVelocityMs, a.speedOfSoundMs) } }) },
  { id: "x_music_tuning_table", name: "Tuning Table Generator", description: "Generate equal temperament tuning table for multiple octaves", parameters: { rootFreq: { type: "number", description: "Root frequency A4 in Hz (default 440)", required: false }, octaves: { type: "number", description: "Number of octaves (default 4)", required: false } }, category: "music", execute: async (a) => ({ ok: true, data: MusicTheoryTools.tuningTable(a.rootFreq, a.octaves) }) },

  // GAME MECHANICS (10 tools)
  { id: "x_game_expected_dmg", name: "Expected Damage Calculator", description: "Calculate expected damage with crit chance and elemental bonuses", parameters: { baseDamage: { type: "number", description: "Base damage", required: true }, critChance: { type: "number", description: "Crit chance (0-1)", required: true }, critMultiplier: { type: "number", description: "Crit multiplier", required: true }, elementalBonus: { type: "number", description: "Elemental bonus multiplier (default 0)", required: false } }, category: "game-mechanics", execute: async (a) => ({ ok: true, data: { expectedDamage: GameMechanicsTools.expectedDamage(a.baseDamage, a.critChance, a.critMultiplier, a.elementalBonus) } }) },
  { id: "x_game_dps", name: "DPS Calculator", description: "Calculate damage per second from hit damage, attack speed, and crit stats", parameters: { hitDamage: { type: "number", description: "Damage per hit", required: true }, attackSpeedPerSecond: { type: "number", description: "Attacks per second", required: true }, critChance: { type: "number", description: "Crit chance (0-1)", required: false }, critMultiplier: { type: "number", description: "Crit multiplier (default 1)", required: false } }, category: "game-mechanics", execute: async (a) => ({ ok: true, data: { dps: GameMechanicsTools.dps(a.hitDamage, a.attackSpeedPerSecond, a.critChance, a.critMultiplier) } }) },
  { id: "x_game_ttk", name: "Time-to-Kill Calculator", description: "Calculate time to kill from HP and DPS", parameters: { hp: { type: "number", description: "Target HP", required: true }, dps: { type: "number", description: "Your DPS", required: true } }, category: "game-mechanics", execute: async (a) => ({ ok: true, data: { timeToKillSeconds: GameMechanicsTools.timeToKill(a.hp, a.dps) } }) },
  { id: "x_game_loot_chance", name: "Cumulative Loot Drop Chance", description: "Calculate cumulative drop probability from multiple independent sources", parameters: { dropChances: { type: "string", description: "JSON array of drop chances (0-1 each)", required: true } }, category: "game-mechanics", execute: async (a) => ({ ok: true, data: { cumulativeChance: GameMechanicsTools.cumulativeDropProbability(JSON.parse(a.dropChances)) } }) },
  { id: "x_game_expected_loot", name: "Expected Loot Calculator", description: "Calculate expected loot from N attempts with probability p", parameters: { attempts: { type: "number", description: "Number of attempts", required: true }, probability: { type: "number", description: "Drop probability (0-1)", required: true } }, category: "game-mechanics", execute: async (a) => ({ ok: true, data: { expectedLoot: GameMechanicsTools.expectedLoot(a.attempts, a.probability) } }) },
  { id: "x_game_xp_for_level", name: "XP Requirement Calculator", description: "Calculate XP required for next level with polynomial growth", parameters: { level: { type: "number", description: "Current level", required: true }, baseXp: { type: "number", description: "Base XP (default 100)", required: false }, growthRate: { type: "number", description: "Growth rate (default 1.5)", required: false } }, category: "game-mechanics", execute: async (a) => ({ ok: true, data: { xpRequired: GameMechanicsTools.xpForLevel(a.level, a.baseXp, a.growthRate) } }) },
  { id: "x_game_total_xp", name: "Total XP to Level Calculator", description: "Calculate total XP needed to reach target level from level 1", parameters: { targetLevel: { type: "number", description: "Target level", required: true }, baseXp: { type: "number", description: "Base XP (default 100)", required: false }, growthRate: { type: "number", description: "Growth rate (default 1.5)", required: false } }, category: "game-mechanics", execute: async (a) => ({ ok: true, data: { totalXp: GameMechanicsTools.totalXpToLevel(a.targetLevel, a.baseXp, a.growthRate) } }) },
  { id: "x_game_armor_reduction", name: "Armor Damage Reduction", description: "Calculate damage reduction from armor (diminishing returns)", parameters: { armor: { type: "number", description: "Armor value", required: true }, k: { type: "number", description: "Scaling constant (default 100)", required: false } }, category: "game-mechanics", execute: async (a) => ({ ok: true, data: { reductionPercent: GameMechanicsTools.armorReduction(a.armor, a.k) * 100 } }) },
  { id: "x_game_cooldown", name: "Effective Cooldown Calculator", description: "Calculate effective cooldown after cooldown reduction", parameters: { baseCooldownMs: { type: "number", description: "Base cooldown in ms", required: true }, cooldownReduction: { type: "number", description: "CDR (0-1)", required: true } }, category: "game-mechanics", execute: async (a) => ({ ok: true, data: { effectiveCooldownMs: GameMechanicsTools.effectiveCooldown(a.baseCooldownMs, a.cooldownReduction) } }) },
  { id: "x_game_move_speed", name: "Movement Speed Calculator", description: "Calculate effective movement speed from stats and modifiers", parameters: { baseSpeed: { type: "number", description: "Base movement speed", required: true }, buffMultiplier: { type: "number", description: "Buff multiplier (default 1)", required: false }, debuffMultiplier: { type: "number", description: "Debuff multiplier (default 1)", required: false }, terrainModifier: { type: "number", description: "Terrain modifier (default 1)", required: false } }, category: "game-mechanics", execute: async (a) => ({ ok: true, data: { effectiveSpeed: GameMechanicsTools.movementSpeed(a.baseSpeed, a.buffMultiplier, a.debuffMultiplier, a.terrainModifier) } }) },

  // BLOCKCHAIN (10 tools)
  { id: "x_chain_sha256", name: "SHA-256 Hash", description: "Calculate SHA-256 hash of input string", parameters: { data: { type: "string", description: "Data to hash", required: true } }, category: "blockchain", execute: async (a) => ({ ok: true, data: { hash: await BlockchainTools.sha256(a.data) } }) },
  { id: "x_chain_difficulty", name: "Difficulty Target", description: "Generate difficulty target string with N leading zeros", parameters: { difficulty: { type: "number", description: "Number of leading zeros", required: true } }, category: "blockchain", execute: async (a) => ({ ok: true, data: { target: BlockchainTools.difficultyTarget(a.difficulty) } }) },
  { id: "x_chain_adjust_diff", name: "Mining Difficulty Adjuster", description: "Adjust mining difficulty based on block time", parameters: { currentDifficulty: { type: "number", description: "Current difficulty", required: true }, targetBlockTimeSec: { type: "number", description: "Target block time in seconds", required: true }, actualBlockTimeSec: { type: "number", description: "Actual block time in seconds", required: true } }, category: "blockchain", execute: async (a) => ({ ok: true, data: { newDifficulty: BlockchainTools.adjustDifficulty(a.currentDifficulty, a.targetBlockTimeSec, a.actualBlockTimeSec) } }) },
  { id: "x_chain_block_reward", name: "Block Reward Calculator", description: "Calculate block reward with halving schedule", parameters: { initialReward: { type: "number", description: "Initial block reward", required: true }, halvingInterval: { type: "number", description: "Halving interval in blocks", required: true }, blockHeight: { type: "number", description: "Current block height", required: true } }, category: "blockchain", execute: async (a) => ({ ok: true, data: { reward: BlockchainTools.blockReward(a.initialReward, a.halvingInterval, a.blockHeight) } }) },
  { id: "x_chain_tx_fee", name: "Transaction Fee Estimator", description: "Estimate transaction fee from inputs, outputs, and fee rate", parameters: { inputCount: { type: "number", description: "Number of inputs", required: true }, outputCount: { type: "number", description: "Number of outputs", required: true }, feeRateSatPerVbyte: { type: "number", description: "Fee rate in sat/vbyte", required: true } }, category: "blockchain", execute: async (a) => ({ ok: true, data: { feeSatoshis: BlockchainTools.estimateFee(a.inputCount, a.outputCount, a.feeRateSatPerVbyte) } }) },
  { id: "x_chain_merkle", name: "Merkle Root Calculator", description: "Calculate Merkle root from transaction hashes", parameters: { hashes: { type: "string", description: "JSON array of transaction hashes", required: true } }, category: "blockchain", execute: async (a) => ({ ok: true, data: { merkleRoot: BlockchainTools.merkleRoot(JSON.parse(a.hashes)) } }) },
  { id: "x_chain_gas", name: "Gas Estimator", description: "Estimate gas for blockchain transaction", parameters: { operation: { type: "string", description: "Operation: transfer|contractCall|contractDeploy|erc20Transfer", required: true }, dataLength: { type: "number", description: "Data length in bytes", required: true } }, category: "blockchain", execute: async (a) => ({ ok: true, data: { gasUnits: BlockchainTools.estimateGas(a.operation, a.dataLength) } }) },
  { id: "x_chain_staking", name: "Staking Daily Rate", description: "Convert staking APY to daily compounding rate", parameters: { apyPercent: { type: "number", description: "APY in percent", required: true } }, category: "blockchain", execute: async (a) => ({ ok: true, data: { dailyRate: BlockchainTools.stakingDailyRate(a.apyPercent) } }) },
  { id: "x_chain_impermanent_loss", name: "Impermanent Loss Calculator", description: "Calculate impermanent loss for liquidity pool positions", parameters: { priceRatio: { type: "number", description: "Price ratio (new/old)", required: true } }, category: "blockchain", execute: async (a) => ({ ok: true, data: { impermanentLossPercent: BlockchainTools.impermanentLoss(a.priceRatio) * 100 } }) },
  { id: "x_chain_nonce", name: "Nonce Calculator", description: "Calculate transaction nonce from address and transaction count", parameters: { address: { type: "string", description: "Wallet address", required: true }, transactionCount: { type: "number", description: "Previous transaction count", required: true } }, category: "blockchain", execute: async (a) => ({ ok: true, data: { nonce: BlockchainTools.calculateNonce(a.address, a.transactionCount) } }) },

  // NETWORKING (10 tools)
  { id: "x_net_cidr_mask", name: "CIDR to Subnet Mask", description: "Convert CIDR notation to subnet mask", parameters: { cidr: { type: "number", description: "CIDR prefix (0-32)", required: true } }, category: "networking", execute: async (a) => ({ ok: true, data: { subnetMask: NetworkingTools.cidrToMask(a.cidr) } }) },
  { id: "x_net_mask_cidr", name: "Subnet Mask to CIDR", description: "Convert subnet mask to CIDR prefix length", parameters: { mask: { type: "string", description: "Subnet mask (e.g. 255.255.255.0)", required: true } }, category: "networking", execute: async (a) => ({ ok: true, data: { cidr: NetworkingTools.maskToCidr(a.mask) } }) },
  { id: "x_net_usable_hosts", name: "Usable Hosts Calculator", description: "Calculate number of usable hosts in a subnet", parameters: { cidr: { type: "number", description: "CIDR prefix (1-30)", required: true } }, category: "networking", execute: async (a) => ({ ok: true, data: { usableHosts: NetworkingTools.usableHosts(a.cidr) } }) },
  { id: "x_net_bdp", name: "Bandwidth Delay Product", description: "Calculate bandwidth-delay product for TCP window sizing", parameters: { bandwidthBps: { type: "number", description: "Bandwidth in bits per second", required: true }, delayMs: { type: "number", description: "Round-trip delay in milliseconds", required: true } }, category: "networking", execute: async (a) => ({ ok: true, data: { bdpBits: NetworkingTools.bandwidthDelayProduct(a.bandwidthBps, a.delayMs) } }) },
  { id: "x_net_tcp_throughput", name: "TCP Throughput Estimator", description: "Estimate TCP throughput using Mathis equation", parameters: { mssBytes: { type: "number", description: "MSS in bytes", required: true }, rttMs: { type: "number", description: "RTT in milliseconds", required: true }, lossRate: { type: "number", description: "Packet loss rate (0-1)", required: true } }, category: "networking", execute: async (a) => ({ ok: true, data: { throughputBps: NetworkingTools.tcpThroughput(a.mssBytes, a.rttMs, a.lossRate) } }) },
  { id: "x_net_ip_int", name: "IP to Integer", description: "Convert dotted-notation IP address to integer", parameters: { ip: { type: "string", description: "IP address (e.g. 192.168.1.1)", required: true } }, category: "networking", execute: async (a) => ({ ok: true, data: { ipInteger: NetworkingTools.ipToInt(a.ip) } }) },
  { id: "x_net_int_ip", name: "Integer to IP", description: "Convert integer back to dotted-notation IP address", parameters: { num: { type: "number", description: "Integer IP address", required: true } }, category: "networking", execute: async (a) => ({ ok: true, data: { ip: NetworkingTools.intToIp(a.num) } }) },
  { id: "x_net_network_addr", name: "Network Address Calculator", description: "Calculate network address from IP and CIDR", parameters: { ip: { type: "string", description: "IP address", required: true }, cidr: { type: "number", description: "CIDR prefix", required: true } }, category: "networking", execute: async (a) => ({ ok: true, data: { networkAddress: NetworkingTools.networkAddress(a.ip, a.cidr) } }) },
  { id: "x_net_broadcast", name: "Broadcast Address Calculator", description: "Calculate broadcast address from IP and CIDR", parameters: { ip: { type: "string", description: "IP address", required: true }, cidr: { type: "number", description: "CIDR prefix", required: true } }, category: "networking", execute: async (a) => ({ ok: true, data: { broadcastAddress: NetworkingTools.broadcastAddress(a.ip, a.cidr) } }) },
  { id: "x_net_jitter", name: "Jitter Calculator", description: "Calculate network jitter from RTT samples", parameters: { rttSamplesMs: { type: "string", description: "JSON array of RTT samples in ms", required: true } }, category: "networking", execute: async (a) => ({ ok: true, data: { jitterMs: NetworkingTools.jitter(JSON.parse(a.rttSamplesMs)) } }) },

  // DEVOPS (10 tools)
  { id: "x_devops_deploy_rate", name: "Deployment Success Rate", description: "Calculate deployment success rate", parameters: { successful: { type: "number", description: "Successful deployments", required: true }, failed: { type: "number", description: "Failed deployments", required: true } }, category: "devops", execute: async (a) => ({ ok: true, data: { successRate: DevOpsTools.deploymentSuccessRate(a.successful, a.failed) } }) },
  { id: "x_devops_mtbf", name: "MTBF Calculator", description: "Calculate Mean Time Between Failures", parameters: { uptimeMs: { type: "number", description: "Total uptime in ms", required: true }, failureCount: { type: "number", description: "Number of failures", required: true } }, category: "devops", execute: async (a) => ({ ok: true, data: { mtbfMs: DevOpsTools.mtbf(a.uptimeMs, a.failureCount) } }) },
  { id: "x_devops_mttr", name: "MTTR Calculator", description: "Calculate Mean Time To Recovery", parameters: { downtimeMs: { type: "number", description: "Total downtime in ms", required: true }, recoveryCount: { type: "number", description: "Number of recoveries", required: true } }, category: "devops", execute: async (a) => ({ ok: true, data: { mttrMs: DevOpsTools.mttr(a.downtimeMs, a.recoveryCount) } }) },
  { id: "x_devops_availability", name: "Availability Calculator", description: "Calculate availability percentage from uptime and downtime", parameters: { uptimeMs: { type: "number", description: "Uptime in ms", required: true }, downtimeMs: { type: "number", description: "Downtime in ms", required: true } }, category: "devops", execute: async (a) => ({ ok: true, data: { availabilityPercent: DevOpsTools.availability(a.uptimeMs, a.downtimeMs) * 100 } }) },
  { id: "x_devops_sla", name: "SLA Compliance Checker", description: "Check if actual uptime meets SLA target", parameters: { actualUptimePercent: { type: "number", description: "Actual uptime %", required: true }, slaTargetPercent: { type: "number", description: "SLA target %", required: true } }, category: "devops", execute: async (a) => ({ ok: true, data: DevOpsTools.slaCompliance(a.actualUptimePercent, a.slaTargetPercent) }) },
  { id: "x_devops_container_eff", name: "Container Resource Efficiency", description: "Calculate container CPU and memory efficiency", parameters: { usedCpu: { type: "number", description: "Used CPU cores", required: true }, allocatedCpu: { type: "number", description: "Allocated CPU cores", required: true }, usedMemoryMb: { type: "number", description: "Used memory in MB", required: true }, allocatedMemoryMb: { type: "number", description: "Allocated memory in MB", required: true } }, category: "devops", execute: async (a) => ({ ok: true, data: DevOpsTools.containerEfficiency(a.usedCpu, a.allocatedCpu, a.usedMemoryMb, a.allocatedMemoryMb) }) },
  { id: "x_devops_pipeline", name: "CI/CD Pipeline Duration", description: "Estimate pipeline duration and critical path", parameters: { stageDurationsMs: { type: "string", description: "JSON array of stage durations in ms", required: true } }, category: "devops", execute: async (a) => ({ ok: true, data: DevOpsTools.pipelineDuration(JSON.parse(a.stageDurationsMs)) }) },
  { id: "x_devops_error_rate", name: "Log Error Rate", description: "Calculate error rate from log analysis", parameters: { totalLines: { type: "number", description: "Total log lines", required: true }, errorLines: { type: "number", description: "Error log lines", required: true } }, category: "devops", execute: async (a) => ({ ok: true, data: { errorRate: DevOpsTools.errorRate(a.totalLines, a.errorLines) } }) },
  { id: "x_devops_infra_cost", name: "Infrastructure Cost Estimator", description: "Estimate infrastructure cost from resource usage", parameters: { cpuCostPerHour: { type: "number", description: "CPU cost per hour", required: true }, memoryCostPerGbHour: { type: "number", description: "Memory cost per GB-hour", required: true }, storageCostPerGbMonth: { type: "number", description: "Storage cost per GB-month", required: true }, cpuHours: { type: "number", description: "CPU hours used", required: true }, memoryGbHours: { type: "number", description: "Memory GB-hours used", required: true }, storageGbMonths: { type: "number", description: "Storage GB-months used", required: true } }, category: "devops", execute: async (a) => ({ ok: true, data: { totalCost: DevOpsTools.infrastructureCost(a.cpuCostPerHour, a.memoryCostPerGbHour, a.storageCostPerGbMonth, a.cpuHours, a.memoryGbHours, a.storageGbMonths) } }) },
  { id: "x_devops_scaling", name: "Auto-Scaling Threshold Checker", description: "Check if scaling action is needed based on metrics and cooldown", parameters: { currentMetric: { type: "number", description: "Current metric value", required: true }, upperThreshold: { type: "number", description: "Scale-up threshold", required: true }, lowerThreshold: { type: "number", description: "Scale-down threshold", required: true }, cooldownMs: { type: "number", description: "Cooldown period in ms", required: true }, lastScaleTimeMs: { type: "number", description: "Last scale event timestamp", required: true } }, category: "devops", execute: async (a) => ({ ok: true, data: { action: DevOpsTools.scalingThreshold(a.currentMetric, a.upperThreshold, a.lowerThreshold, a.cooldownMs, a.lastScaleTimeMs) } }) },

  // DATABASE (10 tools)
  { id: "x_db_complexity", name: "Query Complexity Estimator", description: "Estimate SQL query complexity from structure", parameters: { tablesJoined: { type: "number", description: "Number of tables joined", required: true }, whereConditions: { type: "number", description: "Number of WHERE conditions", required: true }, subqueries: { type: "number", description: "Number of subqueries", required: true }, aggregations: { type: "number", description: "Number of aggregations", required: true } }, category: "database", execute: async (a) => ({ ok: true, data: { complexityScore: DatabaseTools.queryComplexity(a.tablesJoined, a.whereConditions, a.subqueries, a.aggregations) } }) },
  { id: "x_db_selectivity", name: "Index Selectivity Calculator", description: "Calculate index selectivity for query optimization", parameters: { distinctValues: { type: "number", description: "Number of distinct values", required: true }, totalRows: { type: "number", description: "Total rows in table", required: true } }, category: "database", execute: async (a) => ({ ok: true, data: { selectivity: DatabaseTools.indexSelectivity(a.distinctValues, a.totalRows) } }) },
  { id: "x_db_buffer_pool", name: "Buffer Pool Hit Rate", description: "Calculate buffer pool hit rate from cache statistics", parameters: { hits: { type: "number", description: "Cache hits", required: true }, misses: { type: "number", description: "Cache misses", required: true } }, category: "database", execute: async (a) => ({ ok: true, data: { hitRate: DatabaseTools.bufferPoolHitRate(a.hits, a.misses) } }) },
  { id: "x_db_bloat", name: "Table Bloat Estimator", description: "Estimate dead space from table bloat percentage", parameters: { deadTuplePercent: { type: "number", description: "Dead tuple percentage", required: true }, tableSizeMb: { type: "number", description: "Table size in MB", required: true } }, category: "database", execute: async (a) => ({ ok: true, data: DatabaseTools.tableBloat(a.deadTuplePercent, a.tableSizeMb) }) },
  { id: "x_db_pool_size", name: "Connection Pool Sizing", description: "Recommend connection pool size from CPU cores and disk spindles", parameters: { cpuCores: { type: "number", description: "Number of CPU cores", required: true }, diskSpindles: { type: "number", description: "Number of disk spindles", required: true } }, category: "database", execute: async (a) => ({ ok: true, data: { recommendedPoolSize: DatabaseTools.connectionPoolSize(a.cpuCores, a.diskSpindles) } }) },
  { id: "x_db_exec_time", name: "Query Execution Time Estimator", description: "Estimate query execution time from scan rows and index usage", parameters: { rowsScanned: { type: "number", description: "Rows scanned", required: true }, rowsReturned: { type: "number", description: "Rows returned", required: true }, indexLookup: { type: "boolean", description: "Using index lookup?", required: true }, ioTimePerRowMs: { type: "number", description: "IO time per row in ms", required: true }, cpuTimePerRowMs: { type: "number", description: "CPU time per row in ms", required: true } }, category: "database", execute: async (a) => ({ ok: true, data: { estimatedTimeMs: DatabaseTools.estimatedExecutionTime(a.rowsScanned, a.rowsReturned, a.indexLookup, a.ioTimePerRowMs, a.cpuTimePerRowMs) } }) },
  { id: "x_db_replication", name: "Replication Lag Impact", description: "Assess impact of replication lag on data freshness", parameters: { lagMs: { type: "number", description: "Replication lag in ms", required: true }, writesPerSecond: { type: "number", description: "Write operations per second", required: true } }, category: "database", execute: async (a) => ({ ok: true, data: DatabaseTools.replicationImpact(a.lagMs, a.writesPerSecond) }) },
  { id: "x_db_sharding", name: "Sharding Distribution Analyzer", description: "Analyze shard key distribution balance", parameters: { totalRecords: { type: "number", description: "Total records", required: true }, shardCount: { type: "number", description: "Number of shards", required: true }, keyDistribution: { type: "number", description: "Key distribution skew factor", required: true } }, category: "database", execute: async (a) => ({ ok: true, data: DatabaseTools.shardingDistribution(a.totalRecords, a.shardCount, a.keyDistribution) }) },
  { id: "x_db_vacuum", name: "Vacuum Frequency Advisor", description: "Recommend vacuum frequency based on dead tuple percentage", parameters: { deadTuplePercent: { type: "number", description: "Dead tuple percentage", required: true }, tableGrowthRateMbDay: { type: "number", description: "Table growth rate in MB/day", required: true }, availableDiskGb: { type: "number", description: "Available disk in GB", required: true } }, category: "database", execute: async (a) => ({ ok: true, data: DatabaseTools.vacuumFrequency(a.deadTuplePercent, a.tableGrowthRateMbDay, a.availableDiskGb) }) },
  { id: "x_db_throughput", name: "Transaction Throughput Estimator", description: "Estimate mixed OLTP/OLAP transaction throughput", parameters: { oltpTps: { type: "number", description: "OLTP transactions per second", required: true }, olapTps: { type: "number", description: "OLAP queries per second", required: true }, mixedRatio: { type: "number", description: "OLTP ratio (0-1)", required: true } }, category: "database", execute: async (a) => ({ ok: true, data: { estimatedTps: DatabaseTools.transactionThroughput(a.oltpTps, a.olapTps, a.mixedRatio) } }) },

  // ═══════════════════════════════════════════════════════════════
  // QUANTUM COMPUTING (10 tools)
  // ═══════════════════════════════════════════════════════════════
  { id: "x_quantum_rx_gate", name: "Rx Gate Matrix", description: "Compute qubit Rx rotation gate matrix", parameters: { theta: { type: "number", description: "Rotation angle in radians", required: true } }, category: "quantum", execute: async (a) => ({ ok: true, data: QuantumComputingTools.rxGate(a.theta) }) },
  { id: "x_quantum_hadamard", name: "Hadamard Gate", description: "Get Hadamard gate matrix", parameters: {}, category: "quantum", execute: async () => ({ ok: true, data: QuantumComputingTools.hadamardGate() }) },
  { id: "x_quantum_cnot", name: "CNOT Gate", description: "Get CNOT gate matrix (4x4)", parameters: {}, category: "quantum", execute: async () => ({ ok: true, data: QuantumComputingTools.cnotGate() }) },
  { id: "x_quantum_entropy", name: "Von Neumann Entropy", description: "Compute von Neumann entropy from eigenvalues", parameters: { eigenvalues: { type: "string", description: "JSON array of eigenvalues", required: true } }, category: "quantum", execute: async (a) => ({ ok: true, data: { entropy: QuantumComputingTools.vonNeumannEntropy(JSON.parse(a.eigenvalues)) } }) },
  { id: "x_quantum_fidelity", name: "Quantum Fidelity", description: "Compute fidelity between two quantum states", parameters: { state1: { type: "string", description: "JSON array of state 1 amplitudes", required: true }, state2: { type: "string", description: "JSON array of state 2 amplitudes", required: true } }, category: "quantum", execute: async (a) => ({ ok: true, data: { fidelity: QuantumComputingTools.fidelity(JSON.parse(a.state1), JSON.parse(a.state2)) } }) },
  { id: "x_quantum_bloch", name: "Bloch Sphere Coords", description: "Convert qubit state to Bloch sphere coordinates", parameters: { alpha: { type: "number", description: "Alpha amplitude", required: true }, beta: { type: "number", description: "Beta amplitude", required: true } }, category: "quantum", execute: async (a) => ({ ok: true, data: QuantumComputingTools.blochSphere(a.alpha, a.beta) }) },
  { id: "x_quantum_decomposition", name: "Gate Decomposition Depth", description: "Estimate gate decomposition depth", parameters: { gateCount: { type: "number", description: "Number of gates", required: true }, qubitCount: { type: "number", description: "Number of qubits", required: true } }, category: "quantum", execute: async (a) => ({ ok: true, data: { depth: QuantumComputingTools.gateDecompositionDepth(a.gateCount, a.qubitCount) } }) },
  { id: "x_quantum_concurrence", name: "Concurrence", description: "Compute concurrence from 2-qubit density matrix", parameters: { rho: { type: "string", description: "JSON 4x4 density matrix", required: true } }, category: "quantum", execute: async (a) => ({ ok: true, data: { concurrence: QuantumComputingTools.concurrence(JSON.parse(a.rho)) } }) },
  { id: "x_quantum_shor_period", name: "Shor Period Finding", description: "Classical simulation of Shor's period finding", parameters: { N: { type: "number", description: "Integer to factor", required: true }, a: { type: "number", description: "Random base", required: true } }, category: "quantum", execute: async (a) => ({ ok: true, data: { period: QuantumComputingTools.shorPeriod(a.N, a.a) } }) },
  { id: "x_quantum_circuit_depth", name: "Circuit Depth", description: "Compute depth of quantum circuit from gate list", parameters: { gates: { type: "string", description: "JSON array of gates [{qubits, type}]", required: true } }, category: "quantum", execute: async (a) => ({ ok: true, data: { depth: QuantumComputingTools.circuitDepth(JSON.parse(a.gates)) } }) },

  // ═══════════════════════════════════════════════════════════════
  // ROBOTICS (10 tools)
  // ═══════════════════════════════════════════════════════════════
  { id: "x_robot_fwd_kinematics", name: "Forward Kinematics", description: "2-link planar arm forward kinematics", parameters: { l1: { type: "number", description: "Link 1 length", required: true }, l2: { type: "number", description: "Link 2 length", required: true }, theta1: { type: "number", description: "Joint 1 angle (rad)", required: true }, theta2: { type: "number", description: "Joint 2 angle (rad)", required: true } }, category: "robotics", execute: async (a) => ({ ok: true, data: RoboticsTools.forwardKinematics2Link(a.l1, a.l2, a.theta1, a.theta2) }) },
  { id: "x_robot_inv_kinematics", name: "Inverse Kinematics", description: "2-link planar arm inverse kinematics", parameters: { l1: { type: "number", description: "Link 1 length", required: true }, l2: { type: "number", description: "Link 2 length", required: true }, x: { type: "number", description: "Target X", required: true }, y: { type: "number", description: "Target Y", required: true } }, category: "robotics", execute: async (a) => ({ ok: true, data: RoboticsTools.inverseKinematics2Link(a.l1, a.l2, a.x, a.y) ?? { error: "Target unreachable" } }) },
  { id: "x_robot_pid", name: "PID Controller", description: "Compute PID controller output", parameters: { error: { type: "number", description: "Current error", required: true }, prevError: { type: "number", description: "Previous error", required: true }, integral: { type: "number", description: "Accumulated integral", required: true }, kp: { type: "number", description: "Proportional gain", required: true }, ki: { type: "number", description: "Integral gain", required: true }, kd: { type: "number", description: "Derivative gain", required: true }, dt: { type: "number", description: "Time step (s)", required: true } }, category: "robotics", execute: async (a) => ({ ok: true, data: { output: RoboticsTools.pidController(a.error, a.prevError, a.integral, a.kp, a.ki, a.kd, a.dt) } }) },
  { id: "x_robot_workspace", name: "Workspace Volume", description: "Robot workspace volume approximation", parameters: { reach: { type: "number", description: "Maximum reach (m)", required: true } }, category: "robotics", execute: async (a) => ({ ok: true, data: { volume: RoboticsTools.workspaceVolume(a.reach) } }) },
  { id: "x_robot_jacobian", name: "Jacobian Matrix", description: "Jacobian matrix for 2-link arm", parameters: { l1: { type: "number", description: "Link 1 length", required: true }, l2: { type: "number", description: "Link 2 length", required: true }, theta1: { type: "number", description: "Joint 1 angle (rad)", required: true }, theta2: { type: "number", description: "Joint 2 angle (rad)", required: true } }, category: "robotics", execute: async (a) => ({ ok: true, data: RoboticsTools.jacobian2Link(a.l1, a.l2, a.theta1, a.theta2) }) },
  { id: "x_robot_manipulability", name: "Manipulability Index", description: "Compute manipulability from Jacobian", parameters: { jacobian: { type: "string", description: "JSON 2x2 Jacobian matrix", required: true } }, category: "robotics", execute: async (a) => ({ ok: true, data: { manipulability: RoboticsTools.manipulability(JSON.parse(a.jacobian)) } }) },
  { id: "x_robot_dynamics", name: "Robot Dynamics", description: "Simplified Lagrangian dynamics", parameters: { mass: { type: "number", description: "Mass (kg)", required: true }, length: { type: "number", description: "Length (m)", required: true }, angularVel: { type: "number", description: "Angular velocity (rad/s)", required: true }, gravity: { type: "number", description: "Gravity (m/s^2)", required: true }, torque: { type: "number", description: "Applied torque (Nm)", required: true } }, category: "robotics", execute: async (a) => ({ ok: true, data: { acceleration: RoboticsTools.robotDynamics(a.mass, a.length, a.angularVel, a.gravity, a.torque) } }) },
  { id: "x_robot_heuristic", name: "Path Heuristic", description: "Euclidean distance heuristic for path planning", parameters: { ax: { type: "number", description: "Point A X", required: true }, ay: { type: "number", description: "Point A Y", required: true }, bx: { type: "number", description: "Point B X", required: true }, by: { type: "number", description: "Point B Y", required: true } }, category: "robotics", execute: async (a) => ({ ok: true, data: { distance: RoboticsTools.heuristic([a.ax, a.ay], [a.bx, a.by]) } }) },
  { id: "x_robot_sensor_fusion", name: "Sensor Fusion", description: "Weighted average sensor fusion", parameters: { readings: { type: "string", description: "JSON array of {value, weight}", required: true } }, category: "robotics", execute: async (a) => ({ ok: true, data: { fused: RoboticsTools.sensorFusion(JSON.parse(a.readings)) } }) },
  { id: "x_robot_pose_error", name: "Pose Error", description: "Robot pose error (distance + angle)", parameters: { cx: { type: "number", description: "Current X", required: true }, cy: { type: "number", description: "Current Y", required: true }, ctheta: { type: "number", description: "Current theta", required: true }, tx: { type: "number", description: "Target X", required: true }, ty: { type: "number", description: "Target Y", required: true }, ttheta: { type: "number", description: "Target theta", required: true } }, category: "robotics", execute: async (a) => ({ ok: true, data: { error: RoboticsTools.poseError({ x: a.cx, y: a.cy, theta: a.ctheta }, { x: a.tx, y: a.ty, theta: a.ttheta }) } }) },

  // ═══════════════════════════════════════════════════════════════
  // BUILTIN TOOLS (19) — Real implementations (no stubs)
  // ═══════════════════════════════════════════════════════════════
  { id: "task", name: "Task", description: "Delegate a task to a sub-agent for autonomous execution", parameters: { prompt: { type: "string", description: "Task description", required: true }, subagent_type: { type: "string", description: "Agent type (explore/general/vision)", required: false } }, category: "builtin", execute: async (a) => {
    const prompt = String(a.prompt ?? "").trim()
    if (!prompt) return { ok: false, error: "prompt is required" }
    return { ok: false, error: "Sub-agent delegation requires an active session runtime. The session Task tool (src/tool/task.ts) is registered separately via tool/registry.ts and must be invoked by the agent loop, not the standalone X registry. Pass your prompt to the model as a follow-up turn instead." }
  } },
  { id: "plan", name: "Plan", description: "Create a structured plan for complex tasks", parameters: { goal: { type: "string", description: "Goal to plan for", required: true } }, category: "builtin", execute: async (a) => {
    const goal = String(a.goal ?? "").trim()
    if (!goal) return { ok: false, error: "goal is required" }
    const planDir = path.join(process.cwd(), ".zyraxon", "plans")
    fs.mkdirSync(planDir, { recursive: true })
    const steps = splitPlanSteps(goal)
    const planId = `${Date.now().toString(36)}-${steps.length}`
    const planPath = path.join(planDir, `${planId}.md`)
    const lines = [`# Plan: ${goal}`, "", `Created: ${new Date().toISOString()}`, "", "## Steps", "", ...steps.map((s, i) => `${i + 1}. ${s}`), ""]
    fs.writeFileSync(planPath, lines.join("\n"), "utf8")
    return { ok: true, data: { planId, goal, steps, path: planPath, stepCount: steps.length } }
  } },
  { id: "apply_patch", name: "Apply Patch", description: "Apply a unified diff patch to files", parameters: { patch: { type: "string", description: "Unified diff patch", required: true } }, category: "builtin", execute: async (a) => {
    const patchText = String(a.patch ?? "")
    if (!patchText.trim()) return { ok: false, error: "patch is required" }
    const cwd = process.cwd()
    try {
      if (patchText.includes("*** Begin Patch")) {
        const { parsePatch, deriveNewContentsFromChunks } = await import("../patch")
        const { hunks } = parsePatch(patchText)
        if (hunks.length === 0) return { ok: false, error: "No hunks found in apply_patch-format patch" }
        const modified: string[] = []
        const added: string[] = []
        const deleted: string[] = []
        for (const hunk of hunks) {
          const file = path.resolve(cwd, hunk.path)
          if (hunk.type === "add") {
            fs.mkdirSync(path.dirname(file), { recursive: true })
            const content = hunk.contents.length === 0 || hunk.contents.endsWith("\n") ? hunk.contents : `${hunk.contents}\n`
            fs.writeFileSync(file, content, "utf8")
            added.push(hunk.path)
          } else if (hunk.type === "delete") {
            if (fs.existsSync(file)) fs.unlinkSync(file)
            deleted.push(hunk.path)
          } else {
            if (!fs.existsSync(file)) return { ok: false, error: `File not found for update: ${hunk.path}` }
            const original = fs.readFileSync(file, "utf8")
            try {
              const update = deriveNewContentsFromChunks(hunk.path, hunk.chunks, original)
              if (hunk.move_path) {
                const dest = path.resolve(cwd, hunk.move_path)
                fs.mkdirSync(path.dirname(dest), { recursive: true })
                fs.writeFileSync(dest, update.content, "utf8")
                fs.unlinkSync(file)
                modified.push(hunk.move_path)
              } else {
                fs.writeFileSync(file, update.content, "utf8")
                modified.push(hunk.path)
              }
            } catch (e) {
              return { ok: false, error: `Failed applying hunk to ${hunk.path}: ${e instanceof Error ? e.message : String(e)}` }
            }
          }
        }
        return { ok: true, data: { format: "apply_patch", modified, added, deleted } }
      }
      const result = applyUnifiedDiff(patchText, cwd)
      if (result.errors.length > 0 && result.modified.length === 0 && result.added.length === 0 && result.deleted.length === 0) {
        return { ok: false, error: `Unified diff apply failed: ${result.errors.join("; ")}` }
      }
      return { ok: true, data: { format: "unified-diff", ...result } }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  } },
  { id: "code_analyzer", name: "Code Analyzer", description: "Analyze code for patterns, complexity, and issues", parameters: { code: { type: "string", description: "Code to analyze", required: true }, language: { type: "string", description: "Programming language", required: false } }, category: "builtin", execute: async (a) => {
    const code = String(a.code ?? "")
    if (!code.trim()) return { ok: false, error: "code is required" }
    return { ok: true, data: analyzeCode(code, String(a.language ?? "")) }
  } },
  { id: "api_tester", name: "API Tester", description: "Test API endpoints with various methods and payloads", parameters: { url: { type: "string", description: "API endpoint URL", required: true }, method: { type: "string", description: "HTTP method", required: false }, body: { type: "string", description: "Request body JSON", required: false } }, category: "builtin", execute: async (a) => {
    const url = String(a.url ?? "").trim()
    if (!url) return { ok: false, error: "url is required" }
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return { ok: false, error: `Invalid URL: ${url}` }
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: `Only http/https URLs are supported (got ${parsed.protocol})` }
    }
    const method = (String(a.method ?? "GET") || "GET").toUpperCase()
    const bodyText = a.body === undefined || a.body === null ? "" : String(a.body)
    const init: RequestInit = { method, signal: AbortSignal.timeout(30000), redirect: "follow" }
    if (bodyText && method !== "GET" && method !== "HEAD") {
      init.body = bodyText
      init.headers = { "content-type": "application/json" }
    }
    const started = Date.now()
    try {
      const resp = await fetch(parsed, init)
      const raw = await resp.text()
      const timeMs = Date.now() - started
      const truncated = raw.length > 200000
      let json: unknown = null
      try {
        json = JSON.parse(raw)
      } catch {
        json = null
      }
      return {
        ok: resp.ok,
        data: {
          url: parsed.toString(),
          method,
          status: resp.status,
          statusText: resp.statusText,
          ok: resp.ok,
          timeMs,
          headers: Object.fromEntries(resp.headers.entries()),
          bodyPreview: truncated ? raw.slice(0, 200000) : raw,
          bodyLength: raw.length,
          truncated,
          json,
        },
        error: resp.ok ? undefined : `HTTP ${resp.status} ${resp.statusText}`,
      }
    } catch (e) {
      return { ok: false, error: `Request failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  } },
  { id: "system_info", name: "System Info", description: "Get system information (OS, CPU, memory, disk)", parameters: {}, category: "builtin", execute: async () => {
    try {
      const cpus = os.cpus()
      const totalMem = os.totalmem()
      const freeMem = os.freemem()
      const network = os.networkInterfaces()
      const networkSummary = Object.entries(network).flatMap(([name, addrs]) =>
        (addrs ?? []).filter((a) => a.family === "IPv4").map((a) => ({ name, address: a.address, internal: a.internal })),
      )
      let disk: unknown = null
      try {
        const { execFile } = await import("child_process")
        if (process.platform === "win32") {
          const { stdout } = await execFileAsyncLocal(
            "powershell",
            ["-NoProfile", "-NonInteractive", "-Command", "Get-PSDrive -PSProvider FileSystem | Select-Object Name,@{N='UsedGB';E={[math]::Round($_.Used/1GB,2)}},@{N='FreeGB';E={[math]::Round($_.Free/1GB,2)}} | ConvertTo-Json -Compress"],
            { timeout: 10000, windowsHide: true },
          )
          disk = JSON.parse(stdout.trim() || "null")
        } else {
          const { stdout } = await execFileAsyncLocal("df", ["-k"], { timeout: 10000 })
          disk = stdout
        }
      } catch (e) {
        disk = { error: e instanceof Error ? e.message : String(e) }
      }
      return {
        ok: true,
        data: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          hostname: os.hostname(),
          osType: os.type(),
          osRelease: os.release(),
          cpuModel: cpus[0]?.model ?? "unknown",
          cpuCores: cpus.length,
          cpuSpeedMHz: cpus[0]?.speed ?? 0,
          loadAverage: os.loadavg(),
          totalMemoryBytes: totalMem,
          freeMemoryBytes: freeMem,
          usedMemoryPercent: Number((((totalMem - freeMem) / totalMem) * 100).toFixed(1)),
          uptimeSeconds: os.uptime(),
          user: os.userInfo().username,
          cwd: process.cwd(),
          homedir: os.homedir(),
          tmpdir: os.tmpdir(),
          network: networkSummary,
          disk,
        },
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  } },
  { id: "screen_vision", name: "Screen Vision", description: "Capture and analyze screen content using AI vision", parameters: { prompt: { type: "string", description: "What to look for on screen", required: false } }, category: "builtin", execute: async (a) => {
    try {
      const { captureScreenBase64 } = await import("./mcp-tool-handlers")
      const shot = await captureScreenBase64()
      const prompt = String(a.prompt ?? "").trim() || "Describe what is on screen"
      return { ok: true, data: { base64: shot.base64, width: shot.width, height: shot.height, path: shot.path, prompt, mimeType: "image/png" } }
    } catch (e) {
      return { ok: false, error: `Screen capture failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  } },
  { id: "self_evolve", name: "Self Evolve", description: "Analyze and improve the agent's own codebase and behavior", parameters: { focus: { type: "string", description: "Area to focus (path substring filter)", required: false } }, category: "builtin", execute: async (a) => {
    try {
      const focus = String(a.focus ?? "").trim().toLowerCase()
      const root = process.cwd()
      const skipDirs = new Set(["node_modules", ".git", "dist", "out", ".next", "coverage", ".zyraxon", "target", ".cache"])
      const findings: Array<{ file: string; line: number; kind: string; snippet: string }> = []
      let scanned = 0
      const walk = (dir: string, depth: number) => {
        if (depth > 6 || findings.length >= 400 || scanned >= 4000) return
        let entries: fs.Dirent[]
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true })
        } catch {
          return
        }
        for (const entry of entries) {
          if (findings.length >= 400 || scanned >= 4000) return
          if (entry.isDirectory()) {
            if (skipDirs.has(entry.name) || entry.name.startsWith(".")) continue
            walk(path.join(dir, entry.name), depth + 1)
            continue
          }
          if (!/\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|rb)$/.test(entry.name)) continue
          const full = path.join(dir, entry.name)
          const rel = path.relative(root, full).replaceAll("\\", "/")
          if (focus && !rel.toLowerCase().includes(focus)) continue
          scanned++
          let content: string
          try {
            const stat = fs.statSync(full)
            if (stat.size > 512 * 1024) continue
            content = fs.readFileSync(full, "utf8")
          } catch {
            continue
          }
          const lines = content.split("\n")
          lines.forEach((line, i) => {
            if (findings.length >= 400) return
            const rules: Array<[RegExp, string]> = [
              [/\b(TODO|FIXME|HACK|XXX)\b/, "unresolved-marker"],
              [/console\.log\(/, "debug-console-log"],
              [/\bvar\s+\w+\s*=/, "legacy-var"],
              [/catch\s*\([^)]*\)\s*\{\s*\}/, "empty-catch"],
              [/==\s[^=]/, "loose-equality"],
            ]
            for (const [re, kind] of rules) {
              if (re.test(line)) {
                findings.push({ file: rel, line: i + 1, kind, snippet: line.trim().slice(0, 200) })
                break
              }
            }
            if (line.length > 200 && findings.length < 400) {
              findings.push({ file: rel, line: i + 1, kind: "overlong-line", snippet: `${line.trim().slice(0, 80)}… (${line.length} chars)` })
            }
          })
        }
      }
      walk(root, 0)
      const byKind: Record<string, number> = {}
      for (const f of findings) byKind[f.kind] = (byKind[f.kind] ?? 0) + 1
      return { ok: true, data: { root, focus: focus || null, filesScanned: scanned, findingCount: findings.length, byKind, findings } }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  } },
  { id: "code_mode", name: "Code Mode", description: "Switch between code generation modes", parameters: { mode: { type: "string", description: "Mode name", required: true } }, category: "builtin", execute: async (a) => {
    const mode = String(a.mode ?? "").trim()
    if (!mode) return { ok: false, error: "mode is required" }
    try {
      const dir = path.join(process.cwd(), ".zyraxon")
      fs.mkdirSync(dir, { recursive: true })
      const file = path.join(dir, "code-mode.json")
      let previousMode: string | null = null
      if (fs.existsSync(file)) {
        try {
          const prev = JSON.parse(fs.readFileSync(file, "utf8")) as { mode?: string }
          previousMode = prev.mode ?? null
        } catch {
          previousMode = null
        }
      }
      const next = { mode, previousMode, updatedAt: new Date().toISOString() }
      fs.writeFileSync(file, JSON.stringify(next, null, 2), "utf8")
      return { ok: true, data: next }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  } },
  { id: "mcp_websearch", name: "MCP Web Search", description: "Search the web using MCP server connections", parameters: { query: { type: "string", description: "Search query", required: true } }, category: "builtin", execute: async (a) => {
    const query = String(a.query ?? "").trim()
    if (!query) return { ok: false, error: "query is required" }
    try {
      const results: Array<{ title: string; url: string; snippet: string; source: string }> = []
      try {
        const ia = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`, {
          signal: AbortSignal.timeout(12000),
          headers: { "user-agent": "ZYRAXON-AI/1.0" },
        })
        if (ia.ok) {
          const data = (await ia.json()) as {
            AbstractText?: string
            AbstractURL?: string
            Heading?: string
            RelatedTopics?: Array<{ Text?: string; FirstURL?: string }>
            Answer?: string
          }
          if (data.AbstractText && data.AbstractURL) {
            results.push({ title: data.Heading || query, url: data.AbstractURL, snippet: data.AbstractText, source: "duckduckgo-instant" })
          } else if (data.AbstractText) {
            results.push({ title: data.Heading || query, url: data.AbstractURL || "", snippet: data.AbstractText, source: "duckduckgo-instant" })
          }
          for (const topic of (data.RelatedTopics ?? []).slice(0, 15)) {
            if (topic.Text && topic.FirstURL) {
              const [title, ...rest] = topic.Text.split(" - ")
              results.push({ title, url: topic.FirstURL, snippet: rest.join(" - ") || topic.Text, source: "duckduckgo-related" })
            }
          }
          if (data.Answer) results.unshift({ title: query, url: "", snippet: String(data.Answer), source: "duckduckgo-answer" })
        }
      } catch {
        // instant answer API optional
      }
      try {
        const html = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
          signal: AbortSignal.timeout(12000),
          headers: { "user-agent": "Mozilla/5.0 (compatible; ZYRAXON-AI/1.0)" },
        })
        if (html.ok) {
          const body = await html.text()
          const linkRe = /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g
          const snipRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g
          const links: Array<{ url: string; title: string }> = []
          let m: RegExpExecArray | null
          while ((m = linkRe.exec(body)) !== null && links.length < 20) {
            let url = m[1]
            if (url.includes("uddg=")) {
              try {
                const u = new URL(url, "https://duckduckgo.com")
                const redirected = u.searchParams.get("uddg")
                if (redirected) url = redirected
              } catch {
                // keep original
              }
            }
            links.push({ url, title: m[2].replace(/<[^>]+>/g, "").trim() })
          }
          const snippets: string[] = []
          while ((m = snipRe.exec(body)) !== null && snippets.length < 20) {
            snippets.push(m[1].replace(/<[^>]+>/g, "").trim())
          }
          links.forEach((l, i) => {
            if (results.some((r) => r.url === l.url)) return
            results.push({ title: l.title, url: l.url, snippet: snippets[i] || "", source: "duckduckgo-html" })
          })
        }
      } catch {
        // html scrape optional
      }
      if (results.length === 0) {
        return { ok: false, error: `No web results for "${query}". Check network connectivity or try a different query.` }
      }
      return { ok: true, data: { query, count: results.length, results } }
    } catch (e) {
      return { ok: false, error: `Web search failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  } },
  { id: "site_create", name: "Site Create", description: "Create a new website with templates and configuration", parameters: { name: { type: "string", description: "Site name", required: true }, template: { type: "string", description: "Template to use", required: false } }, category: "builtin", execute: async (a) => {
    const name = String(a.name ?? "").trim()
    if (!name) return { ok: false, error: "name is required" }
    try {
      const { getSiteManager } = await import("../pro-builder/engine")
      const manager = await getSiteManager()
      const type = inferSiteType(name, String(a.template ?? ""))
      const site = await manager.createSite({ name, type, template: String(a.template ?? "") || type })
      return { ok: true, data: site }
    } catch (e) {
      return { ok: false, error: `site_create failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  } },
  { id: "site_publish", name: "Site Publish", description: "Publish a site to make it live", parameters: { site_id: { type: "string", description: "Site ID", required: true } }, category: "builtin", execute: async (a) => {
    const siteId = String(a.site_id ?? "").trim()
    if (!siteId) return { ok: false, error: "site_id is required" }
    try {
      const { getSiteManager } = await import("../pro-builder/engine")
      const manager = await getSiteManager()
      if (!manager.getSite(siteId)) return { ok: false, error: `Site not found: ${siteId}` }
      const result = await manager.publishSite(siteId)
      return { ok: true, data: result }
    } catch (e) {
      return { ok: false, error: `site_publish failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  } },
  { id: "site_unpublish", name: "Site Unpublish", description: "Take a published site offline", parameters: { site_id: { type: "string", description: "Site ID", required: true } }, category: "builtin", execute: async (a) => {
    const siteId = String(a.site_id ?? "").trim()
    if (!siteId) return { ok: false, error: "site_id is required" }
    try {
      const { getSiteManager } = await import("../pro-builder/engine")
      const manager = await getSiteManager()
      if (!manager.getSite(siteId)) return { ok: false, error: `Site not found: ${siteId}` }
      await manager.unpublishSite(siteId)
      return { ok: true, data: { siteId, published: false } }
    } catch (e) {
      return { ok: false, error: `site_unpublish failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  } },
  { id: "site_domain", name: "Site Domain", description: "Configure custom domain for a site", parameters: { site_id: { type: "string", description: "Site ID", required: true }, domain: { type: "string", description: "Custom domain", required: true } }, category: "builtin", execute: async (a) => {
    const siteId = String(a.site_id ?? "").trim()
    const domain = String(a.domain ?? "").trim()
    if (!siteId) return { ok: false, error: "site_id is required" }
    if (!domain || !domain.includes(".")) return { ok: false, error: `Invalid domain: ${domain || "(empty)"}` }
    try {
      const { getSiteManager } = await import("../pro-builder/engine")
      const manager = await getSiteManager()
      if (!manager.getSite(siteId)) return { ok: false, error: `Site not found: ${siteId}` }
      const result = await manager.setCustomDomain(siteId, domain)
      return { ok: true, data: result }
    } catch (e) {
      return { ok: false, error: `site_domain failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  } },
  { id: "site_preview", name: "Site Preview", description: "Generate a preview URL for a site", parameters: { site_id: { type: "string", description: "Site ID", required: true } }, category: "builtin", execute: async (a) => {
    const siteId = String(a.site_id ?? "").trim()
    if (!siteId) return { ok: false, error: "site_id is required" }
    try {
      const { getSiteManager } = await import("../pro-builder/engine")
      const manager = await getSiteManager()
      if (!manager.getSite(siteId)) return { ok: false, error: `Site not found: ${siteId}` }
      const url = await manager.startServer(siteId)
      return { ok: true, data: { siteId, previewUrl: url } }
    } catch (e) {
      return { ok: false, error: `site_preview failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  } },
  { id: "media_fetch", name: "Media Fetch", description: "Fetch media content from URLs (images, videos, audio)", parameters: { url: { type: "string", description: "Media URL", required: true }, type: { type: "string", description: "Media type hint", required: false } }, category: "builtin", execute: async (a) => {
    const url = String(a.url ?? "").trim()
    if (!url) return { ok: false, error: "url is required" }
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return { ok: false, error: `Invalid URL: ${url}` }
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { ok: false, error: `Only http/https supported (got ${parsed.protocol})` }
    }
    try {
      const resp = await fetch(parsed, { signal: AbortSignal.timeout(60000), redirect: "follow", headers: { "user-agent": "ZYRAXON-AI/1.0" } })
      if (!resp.ok) return { ok: false, error: `HTTP ${resp.status} ${resp.statusText} for ${parsed.toString()}` }
      const contentType = resp.headers.get("content-type") || "application/octet-stream"
      const hint = String(a.type ?? "").trim()
      const ext = extensionForMedia(contentType, hint, parsed.pathname)
      const bytes = Buffer.from(await resp.arrayBuffer())
      const dir = path.join(process.cwd(), ".zyraxon", "media")
      fs.mkdirSync(dir, { recursive: true })
      const base = sanitizeFilename(path.basename(parsed.pathname) || `media-${Date.now()}`)
      const outPath = path.join(dir, `${base}${ext}`)
      fs.writeFileSync(outPath, bytes)
      return { ok: true, data: { path: outPath, size: bytes.length, contentType, url: parsed.toString(), typeHint: hint || null } }
    } catch (e) {
      return { ok: false, error: `media_fetch failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  } },
  { id: "svg_generate", name: "SVG Generate", description: "Generate SVG graphics from descriptions", parameters: { description: { type: "string", description: "What to draw", required: true }, width: { type: "number", description: "Width", required: false }, height: { type: "number", description: "Height", required: false } }, category: "builtin", execute: async (a) => {
    const description = String(a.description ?? "").trim()
    if (!description) return { ok: false, error: "description is required" }
    const width = Math.max(16, Math.min(numOr(a.width, 400), 4096))
    const height = Math.max(16, Math.min(numOr(a.height, 300), 4096))
    const svg = generateSvgFromDescription(description, width, height)
    return { ok: true, data: { svg, width, height, description } }
  } },
  { id: "github_connect", name: "GitHub Connect", description: "Connect to GitHub for repository operations", parameters: { repo: { type: "string", description: "Repository (owner/name)", required: false } }, category: "builtin", execute: async (a) => {
    const repo = String(a.repo ?? "").trim().replace(/^https?:\/\/github\.com\//, "").replace(/\.git$/, "")
    try {
      const { execFile } = await import("child_process")
      const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || process.env.GITHUB_PAT || ""
      const checks: Record<string, unknown> = { envTokenPresent: Boolean(token) }
      let ghInstalled = false
      let ghAuthenticated: boolean | null = null
      let ghAccount: string | null = null
      try {
        await execFileAsyncLocal("gh", ["--version"], { timeout: 8000, windowsHide: true })
        ghInstalled = true
      } catch {
        ghInstalled = false
      }
      if (ghInstalled) {
        try {
          const { stdout } = await execFileAsyncLocal("gh", ["auth", "status"], { timeout: 10000, windowsHide: true })
          const out = stdout
          ghAuthenticated = !/not logged in/i.test(out)
          const userMatch = out.match(/Logged in to github\.com as\s+([^\s(]+)/i)
          ghAccount = userMatch ? userMatch[1] : null
          checks.ghAuthStatus = out.trim().slice(0, 2000)
        } catch (e) {
          ghAuthenticated = false
          checks.ghAuthError = e instanceof Error ? e.message : String(e)
        }
      }
      let storedTokenPath: string | null = null
      let storedTokenPresent = false
      const githubJson = path.join(os.homedir(), ".zyraxon", "github.json")
      if (fs.existsSync(githubJson)) {
        storedTokenPath = githubJson
        try {
          const raw = fs.readFileSync(githubJson, "utf8")
          storedTokenPresent = raw.length > 0
        } catch {
          storedTokenPresent = false
        }
      }
      checks.storedToken = { path: storedTokenPath, present: storedTokenPresent }
      let repoReachable: boolean | null = null
      let repoInfo: unknown = null
      if (repo) {
        const apiUrl = `https://api.github.com/repos/${repo}`
        try {
          const resp = await fetch(apiUrl, {
            signal: AbortSignal.timeout(12000),
            headers: {
              accept: "application/vnd.github+json",
              "user-agent": "ZYRAXON-AI/1.0",
              ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
          })
          repoReachable = resp.ok
          if (resp.ok) {
            const data = (await resp.json()) as { full_name?: string; private?: boolean; default_branch?: string; html_url?: string }
            repoInfo = data
          } else {
            checks.repoHttpStatus = resp.status
          }
        } catch (e) {
          repoReachable = false
          checks.repoError = e instanceof Error ? e.message : String(e)
        }
      }
      const authenticated = Boolean(token) || ghAuthenticated === true || storedTokenPresent
      return {
        ok: true,
        data: {
          authenticated,
          repo: repo || null,
          repoReachable,
          repoInfo,
          ghInstalled,
          ghAuthenticated,
          ghAccount,
          ...checks,
        },
      }
    } catch (e) {
      return { ok: false, error: `github_connect failed: ${e instanceof Error ? e.message : String(e)}` }
    }
  } },
  { id: "external_directory", name: "External Directory", description: "Manage external directory entries and resources", parameters: { action: { type: "string", description: "Action (list/add/remove)", required: true }, path: { type: "string", description: "Directory path", required: false } }, category: "builtin", execute: async (a) => {
    const action = String(a.action ?? "").trim().toLowerCase()
    const dirPathRaw = a.path === undefined || a.path === null ? "" : String(a.path)
    const registryPath = path.join(os.homedir(), ".zyraxon", "external-directories.json")
    try {
      let entries: Array<{ path: string; addedAt: string }> = []
      if (fs.existsSync(registryPath)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8")) as unknown
          if (Array.isArray(parsed)) {
            entries = parsed.filter((e): e is { path: string; addedAt: string } => Boolean(e) && typeof (e as { path?: unknown }).path === "string")
          }
        } catch {
          entries = []
        }
      }
      const save = () => {
        fs.mkdirSync(path.dirname(registryPath), { recursive: true })
        fs.writeFileSync(registryPath, JSON.stringify({ directories: entries }, null, 2), "utf8")
      }
      if (action === "list") {
        const detailed = entries.map((e) => ({
          path: e.path,
          addedAt: e.addedAt,
          exists: fs.existsSync(e.path),
          isDirectory: fs.existsSync(e.path) ? fs.statSync(e.path).isDirectory() : false,
        }))
        return { ok: true, data: { registry: registryPath, count: detailed.length, directories: detailed } }
      }
      if (action === "add") {
        if (!dirPathRaw) return { ok: false, error: "path is required for add" }
        const resolved = path.resolve(dirPathRaw)
        if (!fs.existsSync(resolved)) return { ok: false, error: `Directory does not exist: ${resolved}` }
        if (!fs.statSync(resolved).isDirectory()) return { ok: false, error: `Path is not a directory: ${resolved}` }
        if (entries.some((e) => path.resolve(e.path) === resolved)) {
          return { ok: true, data: { added: false, reason: "already registered", path: resolved, directories: entries } }
        }
        entries.push({ path: resolved, addedAt: new Date().toISOString() })
        save()
        return { ok: true, data: { added: true, path: resolved, count: entries.length, directories: entries } }
      }
      if (action === "remove") {
        if (!dirPathRaw) return { ok: false, error: "path is required for remove" }
        const resolved = path.resolve(dirPathRaw)
        const before = entries.length
        entries = entries.filter((e) => path.resolve(e.path) !== resolved)
        if (entries.length === before) return { ok: false, error: `Not in registry: ${resolved}` }
        save()
        return { ok: true, data: { removed: true, path: resolved, count: entries.length, directories: entries } }
      }
      return { ok: false, error: `Unknown action "${action}". Use list, add, or remove.` }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  } },

  // ═══════════════════════════════════════════════════════════════
  // DARK EMPEROR ULTRA TOOLS (8) — Real implementations (no stubs)
  // ═══════════════════════════════════════════════════════════════
  { id: "ultra_codegen", name: "Ultra CodeGen", description: "Advanced code generation with AST analysis, complexity theory, and type theory", parameters: { spec: { type: "string", description: "Code specification", required: true }, language: { type: "string", description: "Target language", required: false } }, category: "ultra", execute: async (a) => {
    const spec = String(a.spec ?? "").trim()
    if (!spec) return { ok: false, error: "spec is required" }
    try {
      const { ultraCodeGen } = await import("../mcp/ultra-codegen")
      const language = String(a.language ?? "").trim() || "typescript"
      const result = await ultraCodeGen({ source: spec, language, task: spec, generate: "all", analyze: true, security: true })
      if (!result.success && !result.output) return { ok: false, error: "ultraCodeGen produced no output" }
      return { ok: result.success, data: result, error: result.success ? undefined : "ultraCodeGen reported success=false" }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  } },
  { id: "ultra_security_sweep", name: "Ultra Security Sweep", description: "Real cryptographic and security analysis engine with number theory", parameters: { target: { type: "string", description: "Code or file to scan", required: true } }, category: "ultra", execute: async (a) => {
    const target = String(a.target ?? "").trim()
    if (!target) return { ok: false, error: "target is required" }
    try {
      const { ultraSecuritySweep } = await import("../mcp/ultra-security-sweep")
      let code = target
      const resolved = path.resolve(target)
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        code = fs.readFileSync(resolved, "utf8")
      }
      const result = await ultraSecuritySweep({ target, code })
      const failed = (result as { success?: boolean; error?: string }).success === false || (result as { error?: string }).error
      if (failed && !(result as { output?: string }).output) {
        return { ok: false, error: (result as { error?: string }).error || "ultraSecuritySweep failed" }
      }
      return { ok: true, data: result }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  } },
  { id: "ultra_performance", name: "Ultra Performance", description: "Statistical analysis, queuing theory, memory profiling, algorithm benchmarking", parameters: { code: { type: "string", description: "Code to analyze", required: true } }, category: "ultra", execute: async (a) => {
    const code = String(a.code ?? "")
    if (!code.trim()) return { ok: false, error: "code is required" }
    try {
      const { ultraPerformance } = await import("../mcp/ultra-performance")
      const result = await ultraPerformance({ code })
      const failed = (result as { success?: boolean }).success === false || (result as { error?: string }).error
      if (failed && !(result as { output?: string }).output) {
        return { ok: false, error: (result as { error?: string }).error || "ultraPerformance failed" }
      }
      return { ok: true, data: result }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  } },
  { id: "ultra_refactor", name: "Ultra Refactor", description: "Category theory, cyclomatic/cognitive/Halstead complexity, AST transformations", parameters: { code: { type: "string", description: "Code to refactor", required: true }, strategy: { type: "string", description: "Refactoring strategy", required: false } }, category: "ultra", execute: async (a) => {
    const code = String(a.code ?? "")
    if (!code.trim()) return { ok: false, error: "code is required" }
    try {
      const { ultraRefactor } = await import("../mcp/ultra-refactor")
      const strategy = String(a.strategy ?? "").trim() || "full"
      const result = await ultraRefactor({ code, strategy })
      const failed = (result as { success?: boolean }).success === false || (result as { error?: string }).error
      if (failed && !(result as { output?: string }).output) {
        return { ok: false, error: (result as { error?: string }).error || "ultraRefactor failed" }
      }
      return { ok: true, data: result }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  } },
  { id: "ultra_test_gen", name: "Ultra Test Gen", description: "NIST ACTS pairwise, boundary value, mutation testing, property-based generation", parameters: { code: { type: "string", description: "Code to generate tests for", required: true } }, category: "ultra", execute: async (a) => {
    const code = String(a.code ?? "")
    if (!code.trim()) return { ok: false, error: "code is required" }
    try {
      const { ultraTestGen } = await import("../mcp/ultra-test-gen")
      const result = await ultraTestGen({ code, strategy: "all" })
      const content = typeof (result as { content?: unknown }).content === "string" ? (result as { content: string }).content : ""
      if (/^Error:/i.test(content.trim())) return { ok: false, error: content.trim() }
      return { ok: true, data: result }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  } },
  { id: "ultra_autodeploy", name: "Ultra AutoDeploy", description: "DAG analysis, circuit breakers, canary deployments, risk assessment", parameters: { target: { type: "string", description: "Deployment target", required: true } }, category: "ultra", execute: async (a) => {
    const target = String(a.target ?? "").trim()
    if (!target) return { ok: false, error: "target is required" }
    try {
      const { ultraAutoDeploy } = await import("../mcp/ultra-autodeploy")
      const result = await ultraAutoDeploy({ target, strategy: "canary", rollback: true })
      const content = typeof (result as { content?: unknown }).content === "string" ? (result as { content: string }).content : ""
      if (/^Error:/i.test(content.trim())) return { ok: false, error: content.trim() }
      return { ok: true, data: result }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  } },
  { id: "ultra_code_review", name: "Ultra Code Review", description: "Deep code review with security, performance, and architecture analysis", parameters: { code: { type: "string", description: "Code to review", required: true } }, category: "ultra", execute: async (a) => {
    const code = String(a.code ?? "")
    if (!code.trim()) return { ok: false, error: "code is required" }
    try {
      const [{ ultraCodeGen }, { ultraSecuritySweep }, { ultraPerformance }] = await Promise.all([
        import("../mcp/ultra-codegen"),
        import("../mcp/ultra-security-sweep"),
        import("../mcp/ultra-performance"),
      ])
      const [analysis, security, performance] = await Promise.all([
        ultraCodeGen({ source: code, analyze: true, security: true, generate: "docs" }),
        ultraSecuritySweep({ code }),
        ultraPerformance({ code }),
      ])
      return { ok: true, data: { analysis, security, performance } }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  } },
  { id: "ultra_quantum", name: "Ultra Quantum", description: "Quantum computing simulation and algorithm analysis", parameters: { circuit: { type: "string", description: "Quantum circuit description", required: true } }, category: "ultra", execute: async (a) => {
    const circuit = String(a.circuit ?? "").trim()
    if (!circuit) return { ok: false, error: "circuit is required" }
    try {
      const sim = simulateQuantumCircuit(circuit)
      if ("error" in sim) return { ok: false, error: sim.error }
      return { ok: true, data: sim }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    }
  } },

  // ═══════════════════════════════════════════════════════════════
]

// ═══════════════════════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

import { execFile } from "child_process"
import { promisify } from "util"

const execFileAsyncLocal = promisify(execFile)

function numOr(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value)
    if (Number.isFinite(n)) return n
  }
  return fallback
}

function splitPlanSteps(goal: string): string[] {
  const pieces = goal
    .split(/\r?\n|;\s*|\s+then\s+|,\s+(?=[a-z])/i)
    .map((s) => s.trim().replace(/[.;,]+$/, ""))
    .filter(Boolean)
  if (pieces.length >= 2) return pieces.slice(0, 30)
  const clauses = goal.split(/\s+and\s+/i).map((s) => s.trim()).filter(Boolean)
  if (clauses.length >= 2) return clauses.slice(0, 30)
  return [`Define success criteria for: ${goal}`, "Gather required inputs and constraints", `Execute: ${goal}`, "Verify the result against the criteria"]
}

function parseDiffPath(raw: string): string | null {
  const cleaned = raw.trim().split("\t")[0].trim()
  if (!cleaned || cleaned === "/dev/null") return null
  if (cleaned.startsWith("a/") || cleaned.startsWith("b/")) return cleaned.slice(2)
  return cleaned
}

function applyUnifiedDiff(patchText: string, cwd: string): { modified: string[]; added: string[]; deleted: string[]; errors: string[] } {
  const normalized = patchText.replace(/\r\n/g, "\n")
  const lines = normalized.split("\n")
  const modified: string[] = []
  const added: string[] = []
  const deleted: string[] = []
  const errors: string[] = []
  let i = 0
  while (i < lines.length) {
    if (!lines[i].startsWith("--- ")) {
      i++
      continue
    }
    const oldPath = parseDiffPath(lines[i].slice(4))
    i++
    let newPath = oldPath
    if (i < lines.length && lines[i].startsWith("+++ ")) {
      newPath = parseDiffPath(lines[i].slice(4))
      i++
    }
    const targetPath = newPath ?? oldPath
    if (!targetPath) {
      errors.push(`Unparsable file header near line ${i}`)
      continue
    }
    type Hunk = { oldStart: number; oldLines: string[]; newLines: string[] }
    const hunks: Hunk[] = []
    while (i < lines.length && !lines[i].startsWith("--- ") && (lines[i].startsWith("@@") || (!lines[i].startsWith("+++") && !lines[i].startsWith("--- ") && hunks.length > 0))) {
      if (!lines[i].startsWith("@@")) {
        i++
        continue
      }
      const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[i])
      if (!m) {
        errors.push(`Bad hunk header: ${lines[i]}`)
        i++
        continue
      }
      const oldStart = Number(m[1])
      i++
      const oldLines: string[] = []
      const newLines: string[] = []
      while (i < lines.length && !lines[i].startsWith("@@") && !lines[i].startsWith("--- ")) {
        const line = lines[i]
        if (line.startsWith("\\")) {
          i++
          continue
        }
        const tag = line[0]
        const body = line.slice(1)
        if (tag === " ") {
          oldLines.push(body)
          newLines.push(body)
          i++
        } else if (tag === "-") {
          oldLines.push(body)
          i++
        } else if (tag === "+") {
          newLines.push(body)
          i++
        } else if (line === "") {
          i++
        } else {
          break
        }
      }
      hunks.push({ oldStart, oldLines, newLines })
    }
    if (newPath === null && oldPath !== null) {
      const file = path.resolve(cwd, oldPath)
      if (fs.existsSync(file)) fs.unlinkSync(file)
      deleted.push(oldPath)
      continue
    }
    if (oldPath === null && newPath !== null) {
      const file = path.resolve(cwd, newPath)
      const content = hunks.flatMap((h) => h.newLines).join("\n")
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, content.endsWith("\n") ? content : `${content}\n`, "utf8")
      added.push(newPath)
      continue
    }
    if (!targetPath) continue
    const file = path.resolve(cwd, targetPath)
    let original: string
    if (fs.existsSync(file)) {
      original = fs.readFileSync(file, "utf8")
    } else {
      original = ""
    }
    const originalLines = original === "" ? [] : original.replace(/\n$/, "").split("\n")
    let cursor = 0
    let failed = false
    for (const hunk of hunks) {
      const start = Math.max(0, hunk.oldStart - 1)
      if (start > originalLines.length) {
        errors.push(`${targetPath}: hunk at ${hunk.oldStart} beyond EOF (${originalLines.length} lines)`)
        failed = true
        break
      }
      if (hunk.oldLines.length > 0) {
        const slice = originalLines.slice(start, start + hunk.oldLines.length)
        if (slice.join("\n") !== hunk.oldLines.join("\n")) {
          let windowIdx = -1
          for (let off = -20; off <= 20; off++) {
            const idx = start + off
            if (idx < 0) continue
            const cand = originalLines.slice(idx, idx + hunk.oldLines.length)
            if (cand.join("\n") === hunk.oldLines.join("\n")) {
              windowIdx = idx
              break
            }
          }
          if (windowIdx < 0) {
            errors.push(`${targetPath}: context mismatch at line ${hunk.oldStart}`)
            failed = true
            break
          }
          originalLines.splice(windowIdx, hunk.oldLines.length, ...hunk.newLines)
          cursor = windowIdx + hunk.newLines.length
        } else {
          originalLines.splice(start, hunk.oldLines.length, ...hunk.newLines)
          cursor = start + hunk.newLines.length
        }
      } else {
        const insertAt = Math.min(start, originalLines.length)
        originalLines.splice(insertAt, 0, ...hunk.newLines)
        cursor = insertAt + hunk.newLines.length
      }
      void cursor
    }
    if (failed) continue
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, originalLines.length > 0 ? `${originalLines.join("\n")}\n` : "", "utf8")
    if (!fs.existsSync(file) && original === "") added.push(targetPath)
    else modified.push(targetPath)
  }
  return { modified, added, deleted, errors }
}

function analyzeCode(code: string, language: string): Record<string, unknown> {
  const lines = code.split("\n")
  const counts = {
    lines: lines.length,
    blankLines: lines.filter((l) => l.trim() === "").length,
    commentLines: lines.filter((l) => /^\s*(\/\/|#|\*|\/\*)/.test(l)).length,
    todo: lines.filter((l) => /\b(TODO|FIXME|HACK)\b/.test(l)).length,
    consoleLog: lines.filter((l) => /console\.log\(/.test(l)).length,
    anyKeywords: (code.match(/:\s*any\b/g) ?? []).length,
    looseEquality: (code.match(/[^=!<>]==[^=]/g) ?? []).length,
    strictEquality: (code.match(/===/g) ?? []).length,
    functions: (code.match(/\b(function\s+\w+|=>|def\s+\w+|func\s+\w+|fn\s+\w+)/g) ?? []).length,
    classes: (code.match(/\b(class\s+\w+)/g) ?? []).length,
    ifs: (code.match(/\bif\s*\(/g) ?? []).length,
    loops: (code.match(/\b(for|while|foreach)\s*\(/g) ?? []).length,
    tryBlocks: (code.match(/\btry\s*\{/g) ?? []).length,
    catchBlocks: (code.match(/\bcatch\s*(\([^)]*\))?\s*\{/g) ?? []).length,
    maxLineLength: lines.reduce((max, l) => Math.max(max, l.length), 0),
  }
  const cyclomatic = 1 + counts.ifs + counts.loops + (code.match(/\bcase\s+/g) ?? []).length + (code.match(/\&\&|\|\|/g) ?? []).length
  const longestLineIdx = lines.findIndex((l) => l.length === counts.maxLineLength)
  const issues: Array<{ severity: string; message: string; line?: number }> = []
  if (counts.todo > 0) issues.push({ severity: "info", message: `${counts.todo} TODO/FIXME markers` })
  if (counts.consoleLog > 0) issues.push({ severity: "warning", message: `${counts.consoleLog} console.log calls (debug leftovers?)` })
  if (counts.anyKeywords > 0) issues.push({ severity: "warning", message: `${counts.anyKeywords} explicit "any" annotations` })
  if (counts.looseEquality > counts.strictEquality && counts.looseEquality > 0) {
    issues.push({ severity: "warning", message: `Loose equality (==) used ${counts.looseEquality} times` })
  }
  if (counts.maxLineLength > 200) issues.push({ severity: "info", message: `Line ${longestLineIdx + 1} is ${counts.maxLineLength} chars`, line: longestLineIdx + 1 })
  if (counts.tryBlocks > 0 && counts.catchBlocks < counts.tryBlocks) {
    issues.push({ severity: "warning", message: "try blocks without matching catch" })
  }
  if (cyclomatic > 25) issues.push({ severity: "error", message: `Cyclomatic complexity ${cyclomatic} exceeds 25` })
  else if (cyclomatic > 15) issues.push({ severity: "warning", message: `Cyclomatic complexity ${cyclomatic} exceeds 15` })
  return {
    language: language || "unknown",
    ...counts,
    cyclomaticComplexity: cyclomatic,
    issues,
    longestLine: counts.maxLineLength,
  }
}

function inferSiteType(name: string, template: string): string {
  const valid = ["portfolio", "landing", "blog", "ecommerce", "business", "restaurant", "saas", "dashboard", "gallery", "custom"]
  const t = template.trim().toLowerCase()
  if (valid.includes(t)) return t
  const n = name.toLowerCase()
  for (const candidate of valid) {
    if (n.includes(candidate)) return candidate
  }
  return "landing"
}

function extensionForMedia(contentType: string, hint: string, pathname: string): string {
  const ct = contentType.toLowerCase()
  if (ct.includes("png")) return ".png"
  if (ct.includes("jpeg") || ct.includes("jpg")) return ".jpg"
  if (ct.includes("webp")) return ".webp"
  if (ct.includes("gif")) return ".gif"
  if (ct.includes("svg")) return ".svg"
  if (ct.includes("mp4")) return ".mp4"
  if (ct.includes("webm")) return ".webm"
  if (ct.includes("mp3")) return ".mp3"
  if (ct.includes("wav")) return ".wav"
  if (ct.includes("ogg")) return ".ogg"
  if (ct.includes("pdf")) return ".pdf"
  const h = hint.toLowerCase()
  if (h === "image") return ".bin"
  if (h === "video") return ".bin"
  if (h === "audio") return ".bin"
  const ext = path.extname(pathname.split("?")[0] ?? "")
  if (ext && ext.length <= 8) return ext.toLowerCase()
  return ".bin"
}

function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 80)
  return cleaned || `media-${Date.now().toString(36)}`
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
}

function generateSvgFromDescription(description: string, width: number, height: number): string {
  const lower = description.toLowerCase()
  const namedColors: Record<string, string> = {
    red: "#ef4444",
    blue: "#3b82f6",
    green: "#22c55e",
    yellow: "#eab308",
    orange: "#f97316",
    purple: "#a855f7",
    pink: "#ec4899",
    cyan: "#06b6d4",
    teal: "#14b8a6",
    gray: "#6b7280",
    grey: "#6b7280",
    black: "#111827",
    white: "#ffffff",
    indigo: "#6366f1",
    lime: "#84cc16",
    amber: "#f59e0b",
    sky: "#0ea5e9",
    violet: "#8b5cf6",
    rose: "#f43f5e",
  }
  const colors: string[] = []
  const hexRe = /#[0-9a-fA-F]{3,8}/g
  let hexMatch: RegExpExecArray | null
  while ((hexMatch = hexRe.exec(description)) !== null) {
    colors.push(hexMatch[0])
  }
  for (const [name, hex] of Object.entries(namedColors)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(description)) colors.push(hex)
  }
  const fill = colors[0] ?? "#6366f1"
  const secondary = colors[1] ?? "#0ea5e9"
  const cx = width / 2
  const cy = height / 2
  const label = escapeXml(description.slice(0, 120))
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}">`,
    `<title>${label}</title>`,
  ]
  if (/\b(gradient|logo)\b/i.test(description)) {
    parts.push(
      `<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${fill}"/><stop offset="100%" stop-color="${secondary}"/></linearGradient></defs>`,
    )
  }
  const useGradient = /\b(gradient|logo)\b/i.test(description)
  const mainFill = useGradient ? "url(#g)" : fill
  if (/\b(circle|avatar|dot|orb|ball)\b/i.test(description)) {
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${Math.min(width, height) / 2.5}" fill="${mainFill}"/>`)
  } else if (/\b(square|rect|card|block|tile)\b/i.test(description)) {
    const pad = Math.min(width, height) * 0.12
    parts.push(`<rect x="${pad}" y="${pad}" width="${width - pad * 2}" height="${height - pad * 2}" rx="${Math.min(24, pad)}" fill="${mainFill}"/>`)
  } else if (/\b(triangle|delta|pyramid)\b/i.test(description)) {
    parts.push(`<polygon points="${cx},${height * 0.15} ${width * 0.1},${height * 0.85} ${width * 0.9},${height * 0.85}" fill="${mainFill}"/>`)
  } else if (/\b(star|badge)\b/i.test(description)) {
    const spikes = 5
    const outer = Math.min(width, height) * 0.42
    const inner = outer * 0.45
    const pts: string[] = []
    for (let i = 0; i < spikes * 2; i++) {
      const r = i % 2 === 0 ? outer : inner
      const angle = (Math.PI / spikes) * i - Math.PI / 2
      pts.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`)
    }
    parts.push(`<polygon points="${pts.join(" ")}" fill="${mainFill}"/>`)
  } else if (/\b(line|underline|divider|bar chart|chart|graph)\b/i.test(description)) {
    const bars = 5
    const barW = (width * 0.7) / bars
    for (let i = 0; i < bars; i++) {
      const h = height * (0.3 + 0.12 * ((i * 37) % 5))
      parts.push(`<rect x="${width * 0.15 + i * barW}" y="${height - h - height * 0.1}" width="${barW * 0.7}" height="${h}" rx="6" fill="${i % 2 === 0 ? mainFill : secondary}"/>`)
    }
  } else if (/\b(icon|arrow|chevron)\b/i.test(description)) {
    const s = Math.min(width, height)
    parts.push(
      `<path d="M ${cx - s * 0.25} ${cy} L ${cx + s * 0.25} ${cy} M ${cx + s * 0.05} ${cy - s * 0.18} L ${cx + s * 0.25} ${cy} L ${cx + s * 0.05} ${cy + s * 0.18}" stroke="${mainFill}" stroke-width="${Math.max(4, s * 0.06)}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
  } else if (/\b(ring|donut|progress|circle chart)\b/i.test(description)) {
    const r = Math.min(width, height) * 0.32
    const circ = 2 * Math.PI * r
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${secondary}" stroke-width="${Math.max(8, r * 0.35)}" fill="none"/>`)
    parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${mainFill}" stroke-width="${Math.max(8, r * 0.35)}" fill="none" stroke-dasharray="${(circ * 0.72).toFixed(1)} ${circ.toFixed(1)}" stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"/>`)
  } else {
    parts.push(`<rect x="0" y="0" width="${width}" height="${height}" rx="${Math.min(24, Math.min(width, height) * 0.08)}" fill="${mainFill}"/>`)
    const fontSize = Math.max(14, Math.min(width, height) / 8)
    const text = escapeXml(description.split(/\s+/).slice(0, 6).join(" "))
    parts.push(
      `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" font-family="system-ui,sans-serif" font-size="${fontSize}" fill="#ffffff">${text}</text>`,
    )
  }
  if (!/\b(icon|arrow|chevron)\b/i.test(description) && !/\b(circle|square|rect|triangle|star|badge|ring|donut)\b/i.test(description)) {
    // background-only shapes already carry the design
  } else if (/\b(caption|label|text)\b/i.test(description)) {
    const fontSize = Math.max(12, Math.min(width, height) / 10)
    parts.push(`<text x="${cx}" y="${height - 16}" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${fontSize}" fill="#111827">${escapeXml(description.slice(0, 60))}</text>`)
  }
  parts.push("</svg>")
  return parts.join("\n")
}

type Complex = { re: number; im: number }

function simulateQuantumCircuit(circuitText: string): { qubits: number; gates: number; depth: number; probabilities: Array<{ bitstring: string; probability: number }>; statevector: Complex[] } | { error: string } {
  type Gate = { name: string; qubits: number[]; angle?: number }
  let gates: Gate[] = []
  const trimmed = circuitText.trim()
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      const list = Array.isArray(parsed) ? parsed : (parsed as { gates?: unknown[]; circuit?: unknown[] }).gates ?? (parsed as { circuit?: unknown[] }).circuit ?? []
      if (!Array.isArray(list)) return { error: "JSON circuit must be an array of gates (or {gates:[...]})" }
      gates = list.map((raw) => {
        const g = raw as { name?: string; gate?: string; type?: string; qubits?: number[]; q?: number; targets?: number[]; controls?: number[]; qubit?: number; theta?: number; angle?: number }
        const name = String(g.name ?? g.gate ?? g.type ?? "").toLowerCase()
        let qubits: number[] = []
        if (Array.isArray(g.qubits)) qubits = g.qubits.map(Number)
        else if (typeof g.q === "number") qubits = [g.q]
        else if (typeof g.qubit === "number") qubits = [g.qubit]
        else if (Array.isArray(g.targets)) qubits = [...(g.controls ?? []).map(Number), ...g.targets.map(Number)]
        return { name, qubits, angle: g.theta ?? g.angle }
      })
    } catch (e) {
      return { error: `Invalid JSON circuit: ${e instanceof Error ? e.message : String(e)}` }
    }
  } else {
    gates = trimmed
      .split(/[\n;]+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const m = /^([a-z0-9]+)\s*(?:\(([^)]*)\))?\s+(.+)$/i.exec(line)
        if (!m) return null
        const name = m[1].toLowerCase()
        const angleText = m[2]
        const qubits = m[3]
          .split(/[,\s]+/)
          .map((q) => Number(q.replace(/^q/i, "")))
          .filter((n) => Number.isFinite(n))
        return { name, qubits, angle: angleText !== undefined ? Number(angleText) : undefined } as Gate
      })
      .filter((g): g is Gate => g !== null)
  }
  if (gates.length === 0) return { error: "No gates parsed. Use JSON [{\"qubits\":[0],\"type\":\"h\"}] or lines like 'h 0' / 'cx 0 1'." }
  if (gates.length > 5000) return { error: `Too many gates (${gates.length}); max 5000` }
  let maxQubit = -1
  for (const g of gates) {
    if (g.qubits.length === 0) return { error: `Gate "${g.name}" is missing qubit targets` }
    for (const q of g.qubits) {
      if (!Number.isInteger(q) || q < 0) return { error: `Invalid qubit index ${q} on gate ${g.name}` }
      maxQubit = Math.max(maxQubit, q)
    }
  }
  const nq = maxQubit + 1
  if (nq > 14) return { error: `Circuit uses ${nq} qubits; simulation capped at 14 (2^14 amplitudes). Reduce the circuit size.` }
  const dim = 1 << nq
  const state: Complex[] = Array.from({ length: dim }, (_, i) => ({ re: i === 0 ? 1 : 0, im: 0 }))
  const applySingle = (m00: Complex, m01: Complex, m10: Complex, m11: Complex, target: number) => {
    const bit = 1 << target
    for (let base = 0; base < dim; base++) {
      if ((base & bit) !== 0) continue
      const other = base | bit
      const a = state[base]
      const b = state[other]
      state[base] = {
        re: m00.re * a.re - m00.im * a.im + m01.re * b.re - m01.im * b.im,
        im: m00.re * a.im + m00.im * a.re + m01.re * b.im + m01.im * b.re,
      }
      state[other] = {
        re: m10.re * a.re - m10.im * a.im + m11.re * b.re - m11.im * b.im,
        im: m10.re * a.im + m10.im * a.re + m11.re * b.im + m11.im * b.re,
      }
    }
  }
  const c = { re: Math.SQRT1_2, im: 0 }
  const gatesApplied: string[] = []
  for (const g of gates) {
    const name = g.name.replace(/cnot/g, "cx")
    switch (name) {
      case "h":
        applySingle(c, c, c, { re: -Math.SQRT1_2, im: 0 }, g.qubits[0])
        break
      case "x":
        applySingle({ re: 0, im: 0 }, { re: 1, im: 0 }, { re: 1, im: 0 }, { re: 0, im: 0 }, g.qubits[0])
        break
      case "y":
        applySingle({ re: 0, im: 0 }, { re: 0, im: -1 }, { re: 0, im: 1 }, { re: 0, im: 0 }, g.qubits[0])
        break
      case "z":
        applySingle({ re: 1, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }, { re: -1, im: 0 }, g.qubits[0])
        break
      case "s":
        applySingle({ re: 1, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 1 }, g.qubits[0])
        break
      case "sdg":
        applySingle({ re: 1, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }, { re: 0, im: -1 }, g.qubits[0])
        break
      case "t": {
        const re = Math.SQRT1_2
        applySingle({ re: 1, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }, { re, im: re }, g.qubits[0])
        break
      }
      case "tdg": {
        const re = Math.SQRT1_2
        applySingle({ re: 1, im: 0 }, { re: 0, im: 0 }, { re: 0, im: 0 }, { re, im: -re }, g.qubits[0])
        break
      }
      case "rx": {
        const theta = g.angle ?? 0
        const cr = Math.cos(theta / 2)
        const sr = Math.sin(theta / 2)
        applySingle({ re: cr, im: 0 }, { re: 0, im: -sr }, { re: 0, im: -sr }, { re: cr, im: 0 }, g.qubits[0])
        break
      }
      case "ry": {
        const theta = g.angle ?? 0
        const cr = Math.cos(theta / 2)
        const sr = Math.sin(theta / 2)
        applySingle({ re: cr, im: 0 }, { re: -sr, im: 0 }, { re: sr, im: 0 }, { re: cr, im: 0 }, g.qubits[0])
        break
      }
      case "rz": {
        const theta = g.angle ?? 0
        applySingle(
          { re: Math.cos(-theta / 2), im: Math.sin(-theta / 2) },
          { re: 0, im: 0 },
          { re: 0, im: 0 },
          { re: Math.cos(theta / 2), im: Math.sin(theta / 2) },
          g.qubits[0],
        )
        break
      }
      case "cx":
      case "cnot": {
        const control = g.qubits[0]
        const target = g.qubits[1]
        const cbit = 1 << control
        const tbit = 1 << target
        for (let i = 0; i < dim; i++) {
          if ((i & cbit) === 0) continue
          if ((i & tbit) !== 0) continue
          const j = i | tbit
          const tmp = state[i]
          state[i] = state[j]
          state[j] = tmp
        }
        break
      }
      case "cz": {
        const control = g.qubits[0]
        const target = g.qubits[1]
        const mask = (1 << control) | (1 << target)
        for (let i = 0; i < dim; i++) {
          if ((i & mask) === mask) {
            state[i] = { re: -state[i].re, im: -state[i].im }
          }
        }
        break
      }
      case "swap": {
        const a = g.qubits[0]
        const b = g.qubits[1]
        const abit = 1 << a
        const bbit = 1 << b
        for (let i = 0; i < dim; i++) {
          const aOn = (i & abit) !== 0
          const bOn = (i & bbit) !== 0
          if (aOn === bOn) continue
          const j = aOn ? i & ~abit | bbit : i & ~bbit | abit
          if (i < j) {
            const tmp = state[i]
            state[i] = state[j]
            state[j] = tmp
          }
        }
        break
      }
      case "measure":
      case "m":
        break
      default:
        return { error: `Unsupported gate "${g.name}". Supported: h x y z s t sdg tdg rx ry rz cx/cnot cz swap measure` }
    }
    gatesApplied.push(name)
  }
  const probabilities = state
    .map((amp, i) => ({
      bitstring: i.toString(2).padStart(nq, "0"),
      probability: Number((amp.re * amp.re + amp.im * amp.im).toFixed(10)),
    }))
    .filter((p) => p.probability > 1e-12)
    .sort((x, y) => y.probability - x.probability)
    .slice(0, 64)
  let depth = 0
  try {
    depth = QuantumComputingTools.circuitDepth(gates.map((g) => ({ qubits: g.qubits, type: g.name }))) as number
  } catch {
    depth = gates.length
  }
  return { qubits: nq, gates: gates.length, depth, probabilities, statevector: state }
}

export function getToolsByCategory(category: string): XToolDef[] {
  return getXToolRegistry().filter(t => t.category === category)
}

export function getToolById(id: string): XToolDef | undefined {
  return getXToolRegistry().find(t => t.id === id)
}

export function getAllCategories(): string[] {
  return [...new Set(getXToolRegistry().map(t => t.category))]
}

export function getToolCount(): number {
  return getXToolRegistry().length
}

export function getToolCountByCategory(): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const tool of getXToolRegistry()) {
    counts[tool.category] = (counts[tool.category] || 0) + 1
  }
  return counts
}
