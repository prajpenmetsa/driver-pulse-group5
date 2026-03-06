import pandas as pd
import numpy as np
import math

#pre-processing
df = pd.read_csv('accelerometer_data.csv')
df['timestamp']= pd.to_datetime(df['timestamp'])
df = df.sort_values(['trip_id', 'timestamp'])
df['horizontal_acceleration']= np.sqrt(df['accel_x']**2+df['accel_y']**2)
df['dt']=df.groupby('trip_id')['timestamp'].diff().dt.total_seconds()
df['accl_diff']=df.groupby('trip_id')['horizontal_acceleration'].diff().abs()
df['acc_dir']=(np.arctan2(df['accel_y'],df['accel_x']))
df['acc_dir_change']=df.groupby('trip_id')['acc_dir'].diff().abs()
df['manuever_acceleration']=(df['accl_diff']/df['dt']).fillna(0)
df['speed_ms'] = df['speed_kmh'] / 3.6
df['dt'] = df.groupby('trip_id')['timestamp'].diff().dt.total_seconds().replace(0, 1)
df['long_accel'] = (df.groupby('trip_id')['speed_ms'].diff() / df['dt']).fillna(0)
df['manuever_acceleration'] = df['manuever_acceleration'].fillna(0)
df['acc_dir_change'] = df['acc_dir_change'].fillna(0)

#labelling
THRESH_ACCEL = 2.5       
THRESH_DECEL = -0.5      
THRESH_MANEUVER_ACC = 0.10 
THRESH_DIR_CHANGE = 0.8 
df['driving_event'] = 'Normal'
maneuver_mask = (df['manuever_acceleration'] > THRESH_MANEUVER_ACC) | (df['acc_dir_change'] > THRESH_DIR_CHANGE)
df.loc[maneuver_mask, 'driving_event'] = 'Sudden Maneuver'
decel_mask = df['long_accel'] < THRESH_DECEL
df.loc[decel_mask, 'driving_event'] = 'Sudden Deceleration' 
accel_mask = df['long_accel'] > THRESH_ACCEL
df.loc[accel_mask, 'driving_event'] = 'Sudden Acceleration'


#motion score calculation
THRESH_ACCEL = 2.5       
THRESH_DECEL = -0.5     
THRESH_MAN_ACC = 0.10  
THRESH_DIR = 0.8
PENALTY_MANEUVER = 0.15  
PENALTY_ACCEL = 0.05     
PENALTY_DECEL = 0.05

def calculate_penalty(row):
    penalty = 0.0
    if row['manuever_acceleration'] > THRESH_MAN_ACC or row['acc_dir_change'] > THRESH_DIR:
        penalty += PENALTY_MANEUVER
    if row['long_accel'] > THRESH_ACCEL:
        penalty += PENALTY_ACCEL
    if row['long_accel'] < THRESH_DECEL:
        penalty += PENALTY_DECEL
    return penalty
df['event_penalty'] = df.apply(calculate_penalty, axis=1)
df['cumulative_penalty'] = df.groupby('trip_id')['event_penalty'].cumsum()
df['dynamic_trip_score'] = (1.0 - df['cumulative_penalty']).clip(lower=0.0, upper=1.0)


final_df=df.drop(columns=['dt','accl_diff','acc_dir','horizontal_acceleration','speed_ms','long_accel','event_penalty','cumulative_penalty'])
final_df.to_csv('processed_data.csv',index=False)


