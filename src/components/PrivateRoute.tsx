// src/components/PrivateRoute.tsx
import React from 'react';
import { Route, Redirect } from 'react-router-dom';
import { isAuthenticated } from '../lib/api';

const PrivateRoute = ({ component: Component, ...rest }) => (
  <Route
    {...rest}
    render={props =>
      isAuthenticated() ? (
        <Component {...props} />
      ) : (
        <Redirect to="/login" />
      )
    }
  />
);

export default PrivateRoute;