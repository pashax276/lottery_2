import numpy as np
import pandas as pd
import logging
from typing import Dict, Any, List, Tuple, Optional
from datetime import datetime, timedelta
from collections import Counter
import itertools
import random
import joblib
import os
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import seaborn as sns
import io
import base64

# Import database
from db import get_db

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("powerball-analytics")

class PowerballAnalytics:
    """
    Advanced analytics and machine learning for Powerball draws
    """
    
    def __init__(self):
        """Initialize the analytics engine"""
        self.db = get_db()
        self.models_dir = os.path.join('data', 'models')
        os.makedirs(self.models_dir, exist_ok=True)
        self.figures_dir = os.path.join('data', 'figures')
        os.makedirs(self.figures_dir, exist_ok=True)
        logger.info("PowerballAnalytics initialized")
    
    def prepare_data(self) -> pd.DataFrame:
        """Prepare the data for analysis"""
        draws = self.db.get_draws(limit=1000)
        
        if not draws:
            logger.warning("No draws found")
            return pd.DataFrame()
        
        data = []
        for draw in draws:
            if not draw.get('white_balls') or len(draw['white_balls']) < 5 or not draw.get('powerball'):
                logger.warning(f"Invalid draw data: {draw}")
                continue
            row = {
                'draw_number': draw['draw_number'],
                'draw_date': datetime.fromisoformat(draw['draw_date']) if isinstance(draw['draw_date'], str) else draw['draw_date'],
                'wb1': draw['white_balls'][0],
                'wb2': draw['white_balls'][1],
                'wb3': draw['white_balls'][2],
                'wb4': draw['white_balls'][3],
                'wb5': draw['white_balls'][4],
                'pb': draw['powerball'],
                'jackpot': draw['jackpot_amount'],
                'winners': draw['winners']
            }
            data.append(row)
        
        if not data:
            logger.warning("No valid draw data after filtering")
            return pd.DataFrame()
        
        df = pd.DataFrame(data)
        df = df.sort_values('draw_date')
        df['draw_date'] = pd.to_datetime(df['draw_date'])
        df = self.add_features(df)
        return df
    
    def add_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Add derived features for analysis"""
        if df.empty:
            logger.warning("Empty DataFrame in add_features")
            return df
        
        df['day_of_week'] = df['draw_date'].dt.dayofweek
        df['month'] = df['draw_date'].dt.month
        df['year'] = df['draw_date'].dt.year
        df['wb_sum'] = df[['wb1', 'wb2', 'wb3', 'wb4', 'wb5']].sum(axis=1)
        df['wb_mean'] = df[['wb1', 'wb2', 'wb3', 'wb4', 'wb5']].mean(axis=1)
        df['wb_std'] = df[['wb1', 'wb2', 'wb3', 'wb4', 'wb5']].std(axis=1)
        df['wb_odd_count'] = df[['wb1', 'wb2', 'wb3', 'wb4', 'wb5']].apply(lambda x: sum(1 for n in x if n % 2 == 1), axis=1)
        df['wb_even_count'] = 5 - df['wb_odd_count']
        df['wb_low_count'] = df[['wb1', 'wb2', 'wb3', 'wb4', 'wb5']].apply(lambda x: sum(1 for n in x if n <= 35), axis=1)
        df['wb_high_count'] = 5 - df['wb_low_count']
        for decade in range(0, 7):
            decade_start = decade * 10 + 1
            decade_end = min(69, (decade + 1) * 10)
            df[f'wb_decade_{decade}'] = df[['wb1', 'wb2', 'wb3', 'wb4', 'wb5']].apply(
                lambda x: sum(1 for n in x if decade_start <= n <= decade_end), 
                axis=1
            )
        df['pb_is_odd'] = df['pb'] % 2 == 1
        df['pb_is_low'] = df['pb'] <= 13
        if len(df) > 1:
            for col in ['wb1', 'wb2', 'wb3', 'wb4', 'wb5', 'pb', 'wb_sum', 'wb_odd_count']:
                df[f'{col}_prev'] = df[col].shift(1)
                df[f'{col}_diff'] = df[col] - df[f'{col}_prev']
            df = df.dropna()
        else:
            logger.info("Single draw, skipping lagged features")
        return df
    
    def train_models(self) -> Dict[str, Any]:
        """Train machine learning models for prediction"""
        try:
            df = self.prepare_data()
            if df.empty:
                logger.warning("No data available for training")
                return {'success': False, 'message': 'No data available for training'}
            wb_models = self.train_white_ball_models(df)
            pb_model = self.train_powerball_model(df)
            self.save_models({
                'white_ball_models': wb_models,
                'powerball_model': pb_model
            })
            return {'success': True, 'message': 'Models trained successfully'}
        except Exception as e:
            logger.error(f"Error training models: {str(e)}")
            return {'success': False, 'message': f'Error training models: {str(e)}'}
    
    def train_white_ball_models(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Train models for white ball prediction"""
        models = {}
        exclude_cols = ['wb1', 'wb2', 'wb3', 'wb4', 'wb5', 'pb', 'draw_number', 'draw_date', 'jackpot', 'winners']
        feature_cols = [col for col in df.columns if col not in exclude_cols]
        for i in range(1, 6):
            target_col = f'wb{i}'
            X = df[feature_cols]
            y = df[target_col]
            if len(X) < 2:
                logger.warning(f"Insufficient data for training {target_col} model")
                models[target_col] = {
                    'model': None,
                    'scaler': None,
                    'train_score': 0,
                    'test_score': 0
                }
                continue
            X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
            scaler = StandardScaler()
            X_train_scaled = scaler.fit_transform(X_train)
            X_test_scaled = scaler.transform(X_test)
            model = RandomForestRegressor(n_estimators=100, random_state=42)
            model.fit(X_train_scaled, y_train)
            train_score = model.score(X_train_scaled, y_train)
            test_score = model.score(X_test_scaled, y_test)
            logger.info(f"Model for {target_col}: train_score={train_score:.4f}, test_score={test_score:.4f}")
            models[target_col] = {
                'model': model,
                'scaler': scaler,
                'train_score': train_score,
                'test_score': test_score
            }
        return models
    
    def train_powerball_model(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Train model for powerball prediction"""
        exclude_cols = ['wb1', 'wb2', 'wb3', 'wb4', 'wb5', 'pb', 'draw_number', 'draw_date', 'jackpot', 'winners']
        feature_cols = [col for col in df.columns if col not in exclude_cols]
        target_col = 'pb'
        X = df[feature_cols]
        y = df[target_col]
        if len(X) < 2:
            logger.warning("Insufficient data for training powerball model")
            return {
                'model': None,
                'scaler': None,
                'train_score': 0,
                'test_score': 0
            }
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
        scaler = StandardScaler()
        X_train_scaled = scaler.fit_transform(X_train)
        X_test_scaled = scaler.transform(X_test)
        model = RandomForestRegressor(n_estimators=100, random_state=42)
        model.fit(X_train_scaled, y_train)
        train_score = model.score(X_train_scaled, y_train)
        test_score = model.score(X_test_scaled, y_test)
        logger.info(f"Model for {target_col}: train_score={train_score:.4f}, test_score={test_score:.4f}")
        return {
            'model': model,
            'scaler': scaler,
            'train_score': train_score,
            'test_score': test_score
        }
    
    def save_models(self, models: Dict[str, Any]) -> None:
        """Save trained models to disk"""
        try:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            filename = os.path.join(self.models_dir, f'powerball_models_{timestamp}.joblib')
            joblib.dump(models, filename)
            logger.info(f"Models saved to {filename}")
            latest_link = os.path.join(self.models_dir, 'powerball_models_latest.joblib')
            if os.path.exists(latest_link):
                os.remove(latest_link)
            os.symlink(filename, latest_link)
        except Exception as e:
            logger.error(f"Error saving models: {str(e)}")
    
    def load_models(self) -> Optional[Dict[str, Any]]:
        """Load trained models from disk"""
        try:
            latest_link = os.path.join(self.models_dir, 'powerball_models_latest.joblib')
            if not os.path.exists(latest_link):
                logger.warning("No trained models found")
                return None
            models = joblib.load(latest_link)
            logger.info(f"Models loaded from {latest_link}")
            return models
        except Exception as e:
            logger.error(f"Error loading models: {str(e)}")
            return None
    
    def generate_ml_prediction_variants(self) -> List[Dict[str, Any]]:
        """Generate three variants of ML-based predictions"""
        try:
            models = self.load_models()
            if not models:
                logger.info("No trained models found, training new models")
                training_result = self.train_models()
                if not training_result.get('success', False):
                    logger.warning("Failed to train models, falling back to pattern predictions")
                    return self.generate_pattern_prediction_variants()
                models = self.load_models()
                if not models:
                    logger.warning("Still no models after training, falling back to pattern predictions")
                    return self.generate_pattern_prediction_variants()
            
            latest_draw = self.db.get_latest_draw()
            if not latest_draw:
                logger.warning("No previous draws found for prediction")
                return self.generate_pattern_prediction_variants()
            
            features = self.prepare_prediction_features(latest_draw)
            if not features:
                logger.warning("Failed to prepare prediction features")
                return self.generate_pattern_prediction_variants()
            
            predictions = []
            
            # Variant 1: Default ML prediction
            default_pred = self._generate_single_ml_prediction(models, features, "Default ML")
            if default_pred:
                predictions.append(default_pred)
            
            # Variant 2: Feature perturbation
            perturbed_features = features.copy()
            for i in range(len(perturbed_features)):
                perturbed_features[i] += random.uniform(-0.15, 0.15) * perturbed_features[i]
            perturbed_pred = self._generate_single_ml_prediction(models, perturbed_features, "Perturbed Features ML")
            if perturbed_pred:
                predictions.append(perturbed_pred)
            
            # Variant 3: Weighted sampling based on model confidence
            weighted_pred = self._generate_weighted_ml_prediction(models, features)
            if weighted_pred:
                predictions.append(weighted_pred)
            
            # Ensure at least 3 predictions
            while len(predictions) < 3:
                fallback_pred = self.generate_pattern_prediction_variants()[0]
                predictions.append(fallback_pred)
            
            return predictions[:3]
        
        except Exception as e:
            logger.error(f"Error generating ML prediction variants: {str(e)}")
            return self.generate_pattern_prediction_variants()
    
    def _generate_single_ml_prediction(self, models: Dict[str, Any], features: List[float], variant_name: str) -> Optional[Dict[str, Any]]:
        """Generate a single ML prediction"""
        try:
            white_balls = []
            used_positions = set()
            
            for i in range(1, 6):
                wb_model = models['white_ball_models'].get(f'wb{i}', {})
                model = wb_model.get('model')
                scaler = wb_model.get('scaler')
                if not model or not scaler:
                    logger.warning(f"No model or scaler for wb{i}")
                    return None
                
                scaled_features = scaler.transform([features])
                prediction = model.predict(scaled_features)
                if not prediction or len(prediction) == 0:
                    logger.warning(f"Empty prediction for wb{i}")
                    return None
                
                ball = int(round(prediction[0]))
                ball = max(1, min(69, ball))
                
                attempts = 0
                while ball in used_positions and attempts < 10:
                    adjustment = random.randint(-5, 5)
                    ball = int(round(prediction[0] + adjustment))
                    ball = max(1, min(69, ball))
                    attempts += 1
                
                if ball not in used_positions:
                    white_balls.append(ball)
                    used_positions.add(ball)
                else:
                    freq_analysis = self.db.get_frequency_analysis()
                    white_freq = [(int(num), freq) for num, freq in freq_analysis['white_balls'].items()]
                    white_freq.sort(key=lambda x: x[1])
                    for num, _ in white_freq:
                        if num not in used_positions:
                            white_balls.append(num)
                            used_positions.add(num)
                            break
            
            white_balls.sort()
            if len(white_balls) < 5:
                logger.warning("Incomplete white balls prediction")
                return None
            
            pb_model = models['powerball_model']
            model = pb_model.get('model')
            scaler = pb_model.get('scaler')
            if not model or not scaler:
                logger.warning("No powerball model or scaler")
                return None
            
            scaled_features = scaler.transform([features])
            pb_prediction = model.predict(scaled_features)
            if not pb_prediction or len(pb_prediction) == 0:
                logger.warning("Empty powerball prediction")
                return None
            
            powerball = int(round(pb_prediction[0]))
            powerball = max(1, min(26, powerball))
            
            wb_confidence = np.mean([m['test_score'] for m in models['white_ball_models'].values() if m.get('test_score')])
            pb_confidence = pb_model['test_score']
            confidence = (wb_confidence * 0.8 + pb_confidence * 0.2) * 100
            
            return {
                'white_balls': white_balls,
                'powerball': powerball,
                'confidence': min(95, max(60, confidence)),
                'method': f'machine-learning ({variant_name})',
                'rationale': f'Based on Random Forest regression models ({variant_name})'
            }
        
        except Exception as e:
            logger.error(f"Error in single ML prediction ({variant_name}): {str(e)}")
            return None
    
    def _generate_weighted_ml_prediction(self, models: Dict[str, Any], features: List[float]) -> Optional[Dict[str, Any]]:
        """Generate an ML prediction using weighted sampling"""
        try:
            white_balls = []
            used_positions = set()
            
            for i in range(1, 6):
                wb_model = models['white_ball_models'].get(f'wb{i}', {})
                model = wb_model.get('model')
                scaler = wb_model.get('scaler')
                if not model or not scaler:
                    logger.warning(f"No model or scaler for wb{i}")
                    return None
                
                scaled_features = scaler.transform([features])
                predictions = []
                for _ in range(10):
                    pred = model.predict(scaled_features)[0]
                    predictions.append(int(round(pred)))
                
                # Weighted selection
                counter = Counter(predictions)
                total = sum(counter.values())
                probabilities = {k: v/total for k, v in counter.items()}
                ball = random.choices(list(probabilities.keys()), weights=list(probabilities.values()), k=1)[0]
                ball = max(1, min(69, ball))
                
                attempts = 0
                while ball in used_positions and attempts < 10:
                    ball = random.choices(list(probabilities.keys()), weights=list(probabilities.values()), k=1)[0]
                    ball = max(1, min(69, ball))
                    attempts += 1
                
                if ball not in used_positions:
                    white_balls.append(ball)
                    used_positions.add(ball)
                else:
                    freq_analysis = self.db.get_frequency_analysis()
                    white_freq = [(int(num), freq) for num, freq in freq_analysis['white_balls'].items()]
                    white_freq.sort(key=lambda x: x[1])
                    for num, _ in white_freq:
                        if num not in used_positions:
                            white_balls.append(num)
                            used_positions.add(num)
                            break
            
            white_balls.sort()
            if len(white_balls) < 5:
                logger.warning("Incomplete white balls prediction")
                return None
            
            pb_model = models['powerball_model']
            model = pb_model.get('model')
            scaler = pb_model.get('scaler')
            if not model or not scaler:
                logger.warning("No powerball model or scaler")
                return None
            
            scaled_features = scaler.transform([features])
            predictions = []
            for _ in range(10):
                pred = model.predict(scaled_features)[0]
                predictions.append(int(round(pred)))
            
            counter = Counter(predictions)
            total = sum(counter.values())
            probabilities = {k: v/total for k, v in counter.items()}
            powerball = random.choices(list(probabilities.keys()), weights=list(probabilities.values()), k=1)[0]
            powerball = max(1, min(26, powerball))
            
            wb_confidence = np.mean([m['test_score'] for m in models['white_ball_models'].values() if m.get('test_score')])
            pb_confidence = pb_model['test_score']
            confidence = (wb_confidence * 0.8 + pb_confidence * 0.2) * 100 * 0.9  # Slightly lower confidence for weighted sampling
            
            return {
                'white_balls': white_balls,
                'powerball': powerball,
                'confidence': min(95, max(60, confidence)),
                'method': 'machine-learning (Weighted Sampling)',
                'rationale': 'Based on weighted sampling from Random Forest predictions'
            }
        
        except Exception as e:
            logger.error(f"Error in weighted ML prediction: {str(e)}")
            return None
    
    def generate_pattern_prediction_variants(self) -> List[Dict[str, Any]]:
        """Generate three variants of pattern-based predictions"""
        try:
            predictions = []
            
            # Variant 1: Default gap analysis
            default_pred = self._generate_gap_pattern_prediction()
            if default_pred:
                predictions.append(default_pred)
            
            # Variant 2: Frequency-based
            freq_pred = self._generate_frequency_pattern_prediction()
            if freq_pred:
                predictions.append(freq_pred)
            
            # Variant 3: Gap with random perturbation
            perturbed_pred = self._generate_perturbed_pattern_prediction()
            if perturbed_pred:
                predictions.append(perturbed_pred)
            
            # Ensure at least 3 unique predictions
            while len(predictions) < 3:
                random_pred = {
                    'white_balls': sorted(random.sample(range(1, 70), 5)),
                    'powerball': random.randint(1, 26),
                    'confidence': 60.0,
                    'method': 'pattern (Random Fallback)',
                    'rationale': 'Random selection due to insufficient pattern data'
                }
                predictions.append(random_pred)
            
            return predictions[:3]
        
        except Exception as e:
            logger.error(f"Error generating pattern prediction variants: {str(e)}")
            return [
                {
                    'white_balls': sorted(random.sample(range(1, 70), 5)),
                    'powerball': random.randint(1, 26),
                    'confidence': 60.0,
                    'method': 'pattern (Random Fallback)',
                    'rationale': f'Random selection due to error: {str(e)}'
                }
            ] * 3
    
    def _generate_gap_pattern_prediction(self) -> Dict[str, Any]:
        """Generate a pattern prediction using gap analysis"""
        recent_draws = self.db.get_draws(limit=10)
        if not recent_draws:
            return {
                'white_balls': sorted(random.sample(range(1, 70), 5)),
                'powerball': random.randint(1, 26),
                'confidence': 60.0,
                'method': 'pattern (Gap Analysis)',
                'rationale': 'Based on random selection (no historical data available)'
            }
        
        patterns = []
        for i in range(1, len(recent_draws)):
            current = recent_draws[i-1]
            previous = recent_draws[i]
            gaps = [current['white_balls'][j] - previous['white_balls'][j] for j in range(min(5, len(current['white_balls']), len(previous['white_balls'])))]
            patterns.append(gaps)
        
        avg_gaps = np.mean(patterns, axis=0) if patterns else [0] * 5
        latest = recent_draws[0]
        
        predicted_white = []
        for i in range(5):
            ball = latest['white_balls'][i] + round(avg_gaps[i]) if i < len(avg_gaps) else latest['white_balls'][i]
            ball = max(1, min(69, ball))
            predicted_white.append(ball)
        
        predicted_white = list(set(predicted_white))
        while len(predicted_white) < 5:
            ball = random.randint(1, 69)
            if ball not in predicted_white:
                predicted_white.append(ball)
        
        predicted_white.sort()
        pb_counter = Counter([d['powerball'] for d in recent_draws])
        powerball = pb_counter.most_common(1)[0][0] if pb_counter else random.randint(1, 26)
        
        return {
            'white_balls': predicted_white,
            'powerball': powerball,
            'confidence': 70.0,
            'method': 'pattern (Gap Analysis)',
            'rationale': 'Based on gap analysis of recent draws'
        }
    
    def _generate_frequency_pattern_prediction(self) -> Dict[str, Any]:
        """Generate a pattern prediction using frequency analysis"""
        freq_analysis = self.db.get_frequency_analysis()
        if not freq_analysis:
            return {
                'white_balls': sorted(random.sample(range(1, 70), 5)),
                'powerball': random.randint(1, 26),
                'confidence': 60.0,
                'method': 'pattern (Frequency Analysis)',
                'rationale': 'Based on random selection (no frequency data available)'
            }
        
        white_freq = [(int(num), freq) for num, freq in freq_analysis['white_balls'].items()]
        white_freq.sort(key=lambda x: x[1], reverse=True)
        # Sample from top 10 frequent numbers to add diversity
        top_white = white_freq[:10]
        predicted_white = random.sample([num for num, _ in top_white], min(5, len(top_white)))
        
        predicted_white = list(set(predicted_white))
        while len(predicted_white) < 5:
            ball = random.randint(1, 69)
            if ball not in predicted_white:
                predicted_white.append(ball)
        
        predicted_white.sort()
        pb_freq = [(int(num), freq) for num, freq in freq_analysis['powerballs'].items()]
        pb_freq.sort(key=lambda x: x[1], reverse=True)
        # Sample from top 5 Powerballs
        top_pb = pb_freq[:5]
        powerball = random.choice([num for num, _ in top_pb]) if top_pb else random.randint(1, 26)
        
        return {
            'white_balls': predicted_white,
            'powerball': powerball,
            'confidence': 65.0,
            'method': 'pattern (Frequency Analysis)',
            'rationale': 'Based on sampling from most frequent numbers in historical draws'
        }
    
    def _generate_perturbed_pattern_prediction(self) -> Dict[str, Any]:
        """Generate a pattern prediction with random perturbation"""
        recent_draws = self.db.get_draws(limit=10)
        if not recent_draws:
            return {
                'white_balls': sorted(random.sample(range(1, 70), 5)),
                'powerball': random.randint(1, 26),
                'confidence': 60.0,
                'method': 'pattern (Perturbed Gap Analysis)',
                'rationale': 'Based on random selection (no historical data available)'
            }
        
        patterns = []
        for i in range(1, len(recent_draws)):
            current = recent_draws[i-1]
            previous = recent_draws[i]
            gaps = [current['white_balls'][j] - previous['white_balls'][j] for j in range(min(5, len(current['white_balls']), len(previous['white_balls'])))]
            patterns.append(gaps)
        
        avg_gaps = np.mean(patterns, axis=0) if patterns else [0] * 5
        latest = recent_draws[0]
        
        predicted_white = []
        for i in range(5):
            perturbation = random.randint(-5, 5)  # Increased perturbation range
            ball = latest['white_balls'][i] + round(avg_gaps[i]) + perturbation if i < len(avg_gaps) else latest['white_balls'][i]
            ball = max(1, min(69, ball))
            predicted_white.append(ball)
        
        predicted_white = list(set(predicted_white))
        while len(predicted_white) < 5:
            ball = random.randint(1, 69)
            if ball not in predicted_white:
                predicted_white.append(ball)
        
        predicted_white.sort()
        pb_counter = Counter([d['powerball'] for d in recent_draws])
        # Sample from top 3 Powerballs to add diversity
        top_pb = pb_counter.most_common(3)
        powerball = random.choice([num for num, _ in top_pb]) if top_pb else random.randint(1, 26)
        
        return {
            'white_balls': predicted_white,
            'powerball': powerball,
            'confidence': 68.0,
            'method': 'pattern (Perturbed Gap Analysis)',
            'rationale': 'Based on gap analysis with enhanced random perturbation'
        }
    
    def generate_ml_prediction(self) -> List[Dict[str, Any]]:
        """Generate multiple ML-based predictions"""
        return self.generate_ml_prediction_variants()
    
    def generate_pattern_prediction(self) -> List[Dict[str, Any]]:
        """Generate multiple pattern-based predictions"""
        return self.generate_pattern_prediction_variants()
    
    def prepare_prediction_features(self, latest_draw: Dict[str, Any]) -> List[float]:
        """Prepare features for prediction from the latest draw"""
        try:
            recent_draws = self.db.get_draws(limit=10)
            if len(recent_draws) < 1:
                logger.warning("No historical data for ML prediction")
                return []
            
            current = latest_draw
            previous = next((d for d in recent_draws if d['draw_number'] < current['draw_number']), None)
            
            features = []
            draw_date = datetime.fromisoformat(current['draw_date']) if isinstance(current['draw_date'], str) else current['draw_date']
            features.extend([
                draw_date.weekday(),
                draw_date.month,
                draw_date.year
            ])
            
            white_balls = current['white_balls']
            if not white_balls or len(white_balls) < 5:
                logger.warning("Invalid white balls in latest draw")
                return []
            
            features.extend([
                sum(white_balls),
                np.mean(white_balls),
                np.std(white_balls),
                sum(1 for n in white_balls if n % 2 == 1),
                sum(1 for n in white_balls if n % 2 == 0),
                sum(1 for n in white_balls if n <= 35),
                sum(1 for n in white_balls if n > 35)
            ])
            
            for decade in range(0, 7):
                decade_start = decade * 10 + 1
                decade_end = min(69, (decade + 1) * 10)
                decade_count = sum(1 for n in white_balls if decade_start <= n <= decade_end)
                features.append(decade_count)
            
            powerball = current['powerball']
            features.extend([
                1 if powerball % 2 == 1 else 0,
                1 if powerball <= 13 else 0
            ])
            
            if previous:
                prev_white_balls = previous['white_balls']
                prev_powerball = previous['powerball']
                if not prev_white_balls or len(prev_white_balls) < 5:
                    logger.warning("Invalid previous white balls")
                    return features
                
                features.extend([
                    current['white_balls'][0],
                    current['white_balls'][1],
                    current['white_balls'][2],
                    current['white_balls'][3],
                    current['white_balls'][4],
                    current['powerball'],
                    sum(white_balls),
                    sum(1 for n in white_balls if n % 2 == 1),
                    previous['white_balls'][0],
                    previous['white_balls'][1],
                    previous['white_balls'][2],
                    previous['white_balls'][3],
                    previous['white_balls'][4],
                    previous['powerball'],
                    sum(prev_white_balls),
                    sum(1 for n in prev_white_balls if n % 2 == 1),
                    current['white_balls'][0] - previous['white_balls'][0],
                    current['white_balls'][1] - previous['white_balls'][1],
                    current['white_balls'][2] - previous['white_balls'][2],
                    current['white_balls'][3] - previous['white_balls'][3],
                    current['white_balls'][4] - previous['white_balls'][4],
                    current['powerball'] - previous['powerball'],
                    sum(white_balls) - sum(prev_white_balls),
                    (sum(1 for n in white_balls if n % 2 == 1) - 
                     sum(1 for n in prev_white_balls if n % 2 == 1))
                ])
            
            return features
        except Exception as e:
            logger.error(f"Error preparing prediction features: {str(e)}")
            return []
    
    def cluster_analysis(self) -> Dict[str, Any]:
        """Perform cluster analysis on white ball numbers"""
        try:
            df = self.prepare_data()
            if df.empty:
                return {'success': False, 'message': 'No data available for analysis'}
            
            white_balls = []
            for _, row in df.iterrows():
                white_balls.extend([row['wb1'], row['wb2'], row['wb3'], row['wb4'], row['wb5']])
            
            X = np.array(white_balls).reshape(-1, 1)
            k_values = range(2, min(15, len(X)))
            inertia = []
            
            for k in k_values:
                kmeans = KMeans(n_clusters=k, random_state=42)
                kmeans.fit(X)
                inertia.append(kmeans.inertia_)
            
            if len(inertia) > 1:
                diffs = np.diff(inertia)
                elbow_idx = np.argmin(diffs) + 1
                optimal_k = k_values[elbow_idx]
            else:
                optimal_k = 2
            
            kmeans = KMeans(n_clusters=optimal_k, random_state=42)
            kmeans.fit(X)
            centers = kmeans.cluster_centers_.flatten()
            clusters = {}
            labels = kmeans.labels_
            
            for i, label in enumerate(labels):
                if label not in clusters:
                    clusters[label] = []
                clusters[label].append(white_balls[i])
            
            cluster_averages = {}
            for label, numbers in clusters.items():
                cluster_averages[label] = np.mean(numbers)
            
            sorted_clusters = sorted(cluster_averages.items(), key=lambda x: x[1])
            result = {
                'centers': centers.tolist(),
                'clusters': {str(k): v for k, v in clusters.items()},
                'cluster_averages': {str(k): v for k, v in cluster_averages.items()},
                'optimal_k': optimal_k
            }
            
            self.db.save_analysis_result('cluster_analysis', result)
            fig_path = self.generate_cluster_visualization(X, labels, centers)
            if fig_path:
                result['visualization'] = f"/figures/{os.path.basename(fig_path)}"
            
            return {'success': True, 'result': result}
        except Exception as e:
            logger.error(f"Error in cluster analysis: {str(e)}")
            return {'success': False, 'message': f'Error in cluster analysis: {str(e)}'}
    
    def generate_cluster_visualization(self, X: np.ndarray, labels: np.ndarray, centers: np.ndarray) -> Optional[str]:
        """Generate a visualization of the clustering results"""
        try:
            plt.figure(figsize=(10, 6))
            plt.hist(X, bins=69, alpha=0.5, label='All Numbers')
            for center in centers:
                plt.axvline(x=center, color='red', linestyle='--')
            plt.title('White Ball Clusters')
            plt.xlabel('Ball Number')
            plt.ylabel('Frequency')
            plt.legend()
            plt.grid(True, alpha=0.3)
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            fig_path = os.path.join(self.figures_dir, f'cluster_analysis_{timestamp}.png')
            plt.savefig(fig_path)
            plt.close()
            return fig_path
        except Exception as e:
            logger.error(f"Error generating cluster visualization: {str(e)}")
            return None
    
    def run_all_analyses(self) -> Dict[str, Any]:
        """Run all analyses and return results"""
        results = {}
        try:
            freq = self.db.get_frequency_analysis()
            results['frequency'] = freq
            cluster = self.cluster_analysis()
            results['clustering'] = cluster
            training = self.train_models()
            results['model_training'] = training
            prediction = self.generate_ml_prediction()
            results['predictions'] = prediction
            return {'success': True, 'results': results}
        except Exception as e:
            logger.error(f"Error running analyses: {str(e)}")
            return {'success': False, 'message': f'Error running analyses: {str(e)}'}
    
    def get_analysis_summary(self) -> Dict[str, Any]:
        """Get a summary of all analysis results"""
        try:
            summary = {}
            freq = self.db.get_frequency_analysis()
            white_freq = [(int(num), freq) for num, freq in freq['white_balls'].items()]
            white_freq.sort(key=lambda x: x[1], reverse=True)
            top_white = white_freq[:10]
            pb_freq = [(int(num), freq) for num, freq in freq['powerballs'].items()]
            pb_freq.sort(key=lambda x: x[1], reverse=True)
            top_pb = pb_freq[:5]
            summary['top_white_balls'] = [{'number': num, 'frequency': f} for num, f in top_white]
            summary['top_powerballs'] = [{'number': num, 'frequency': f} for num, f in top_pb]
            prediction_results = self.db.get_analysis_results('prediction', limit=3)  # Get up to 3 predictions
            if prediction_results:
                summary['latest_predictions'] = [result['result_data'] for result in prediction_results]
            cluster_results = self.db.get_analysis_results('cluster_analysis', limit=1)
            if cluster_results:
                summary['latest_cluster_analysis'] = cluster_results[0]['result_data']
            return {'success': True, 'summary': summary}
        except Exception as e:
            logger.error(f"Error getting analysis summary: {str(e)}")
            return {'success': False, 'message': f'Error getting analysis summary: {str(e)}'}

# Singleton instance
_analytics_instance = None

def get_analytics() -> PowerballAnalytics:
    """Get the analytics singleton instance"""
    global _analytics_instance
    if _analytics_instance is None:
        _analytics_instance = PowerballAnalytics()
    return _analytics_instance