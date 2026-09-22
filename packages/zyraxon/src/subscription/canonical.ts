import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"

export const TIER_ORDER = ["free", "pro", "max", "ultra"] as const
export type Tier = typeof TIER_ORDER[number]

export interface SubscriptionState {
  tier: Tier
  activatedAt: number | null
  expiresAt: number | null
  secretCode: string | null
  stripeSessionId: string | null
}

const FREE_STATE: SubscriptionState = {
  tier: "ultra",
  activatedAt: null,
  expiresAt: null,
  secretCode: null,
  stripeSessionId: null,
}

const SUBSCRIPTION_PATH = join(homedir(), ".zyraxon", "subscription.json")

let _cachedTier: Tier = "free"
let _lastRead = 0
const CACHE_TTL_MS = 2000

function tierRank(tier: Tier): number {
  return TIER_ORDER.indexOf(tier)
}

export function hasAccess(currentTier: Tier, requiredTier: Tier): boolean {
  return tierRank(currentTier) >= tierRank(requiredTier)
}

export function getToolRequiredTier(toolId: string): Tier {
  return TOOL_TIER_MAP[toolId] ?? "max"
}

function parseSubState(raw: unknown): SubscriptionState {
  if (!raw || typeof raw !== "object") return FREE_STATE
  const obj = raw as Record<string, unknown>
  if (typeof obj.tier !== "string") return FREE_STATE
  if (!TIER_ORDER.includes(obj.tier as Tier)) return FREE_STATE
  return {
    tier: obj.tier as Tier,
    activatedAt: typeof obj.activatedAt === "number" ? obj.activatedAt : null,
    expiresAt: typeof obj.expiresAt === "number" ? obj.expiresAt : null,
    secretCode: typeof obj.secretCode === "string" ? obj.secretCode : null,
    stripeSessionId: typeof obj.stripeSessionId === "string" ? obj.stripeSessionId : null,
  }
}

export function validateSubscription(state: SubscriptionState): SubscriptionState {
  if (!TIER_ORDER.includes(state.tier)) return FREE_STATE
  if (state.expiresAt !== null && Date.now() > state.expiresAt) return FREE_STATE
  return state
}

export function getCurrentTier(): Tier {
  const now = Date.now()
  if (now - _lastRead < CACHE_TTL_MS) return _cachedTier
  _lastRead = now
  try {
    if (!existsSync(SUBSCRIPTION_PATH)) {
      _cachedTier = "ultra"
      return _cachedTier
    }
    const data = JSON.parse(readFileSync(SUBSCRIPTION_PATH, "utf-8"))
    const validated = validateSubscription(parseSubState(data))
    _cachedTier = validated.tier
  } catch {
    _cachedTier = "ultra"
  }
  return _cachedTier
}

export function readSubState(): SubscriptionState {
  try {
    if (!existsSync(SUBSCRIPTION_PATH)) return FREE_STATE
    const data = JSON.parse(readFileSync(SUBSCRIPTION_PATH, "utf-8"))
    return validateSubscription(parseSubState(data))
  } catch {
    return FREE_STATE
  }
}

export const TOOL_TIER_MAP: Record<string, Tier> = {
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
  x_uce_process: "max", x_uce_devices: "max", x_uce_history: "max",
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

  ultra_codegen: "ultra", ultra_security_sweep: "ultra", ultra_performance: "ultra",
  ultra_refactor: "ultra", ultra_test_gen: "ultra", ultra_autodeploy: "ultra",
  ultra_code_review: "ultra", ultra_quantum: "ultra",
  x_singularity_process: "ultra", x_singularity_heal: "ultra", x_singularity_learn: "ultra",
  x_singularity_state: "ultra", x_singularity_evolution: "ultra",
  x_guardian_scan: "ultra", x_guardian_context: "ultra", x_guardian_status: "ultra", x_guardian_clear: "ultra",
  x_subscription_status: "free",

  x_chem_limiting_reagent: "pro", x_chem_percent_composition: "pro",
  x_acid_ph_strong: "pro", x_acid_ph_weak: "pro", x_acid_titration: "pro",
  x_bio_shannon_index: "pro", x_bio_simpson_index: "pro",
  x_bio_michaelis_menten: "max", x_bio_hill_equation: "max",
  x_eng_mohrs_circle: "pro", x_eng_flow_rate: "pro", x_eng_pipe_flow: "pro", x_eng_concrete_mix: "pro",
  x_eng_torsion: "pro", x_eng_thermal_stress: "max", x_eng_heat_exchanger: "max",
  x_eng_filter_design: "pro", x_eng_power_factor: "pro",
  x_fin_annuity: "pro", x_fin_dividend_discount: "pro", x_fin_beta: "pro",
  x_ds_standardize: "pro", x_ds_gradient_descent: "max", x_ds_confusion_matrix: "pro",
  x_ds_tfidf: "pro", x_ds_monte_carlo: "max", x_ds_multi_regression: "max",
  x_sec_firewall: "max", x_sec_malware_sig: "max", x_sec_port_scan: "max",
  x_life_savings_goal: "free", x_life_pace: "free", x_life_aspect_ratio: "free",
  x_life_color: "free", x_life_pixel_rem: "free", x_life_wind_chill: "free",
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
  x_uce_context: "max", x_uce_register_device: "max",
}
