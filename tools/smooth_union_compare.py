import numpy as np
import matplotlib.pyplot as plt
from matplotlib.widgets import Slider, RadioButtons

def sdf_square(x, y, center, size=1.0):
    dx = abs(x - center[0]) - size/2
    dy = abs(y - center[1]) - size/2
    return np.maximum(dx, dy)

# Create squares with horizontal overlap
square1_pos = (-0.4, -0.3)  # Left and down
square2_pos = (0.4, 0.3)    # Right and up

def print_values(d1, d2, k):
    """Print intermediate values in smooth union calculation"""
    print(f"\nFor k={k} (radius={1/k}):")
    print(f"d1={d1:.6f}, d2={d2:.6f}")
    
    # Original exponential
    exp1 = np.exp(-k*d1)
    exp2 = np.exp(-k*d2)
    print(f"exp(-k*d1)={exp1:.6e}")
    print(f"exp(-k*d2)={exp2:.6e}")
    sum_exp = exp1 + exp2
    print(f"sum={sum_exp:.6e}")
    result = -np.log(sum_exp)/k
    print(f"result={result:.6f}")

    # Also log values at (10, 10)
    fixed_d1 = sdf_square(10, 10, square1_pos)
    fixed_d2 = sdf_square(10, 10, square2_pos)
    print(f"\nAt point (10, 10):")
    print(f"d1={fixed_d1:.6f}, d2={fixed_d2:.6f}")
    fixed_exp1 = np.exp(-k*fixed_d1)
    fixed_exp2 = np.exp(-k*fixed_d2)
    print(f"exp(-k*d1)={fixed_exp1:.6e}")
    print(f"exp(-k*d2)={fixed_exp2:.6e}")
    fixed_sum = fixed_exp1 + fixed_exp2
    print(f"sum={fixed_sum:.6e}")
    fixed_result = -np.log(fixed_sum)/k
    print(f"result={fixed_result:.6f}")

def smooth_union_exp(d1, d2, k):
    # For points far from both shapes (> 2*radius), just use regular min
    minDist = np.minimum(d1, d2)
    if np.all(minDist > 1.0/k * 2.0):
        return np.minimum(d1, d2)
    return -np.log(np.exp(-k*d1) + np.exp(-k*d2))/k

def smooth_union_poly(d1, d2, k):
    h = np.maximum(k - np.abs(d1 - d2), 0.0) / k
    return np.minimum(d1, d2) - h * h * h * k / 6.0

def smooth_union_quad(d1, d2, k):
    h = np.maximum(0.0, k - np.abs(d1 - d2)) / k
    return np.minimum(d1, d2) - h * h * k / 4.0

def smooth_union_power(d1, d2, k):
    # Avoid division by zero
    eps = 1e-6
    a = np.power(np.abs(d1) + eps, k)
    b = np.power(np.abs(d2) + eps, k)
    return np.power((a * b)/(a + b), 1.0/k)

def smooth_union_scaled_exp(d1, d2, k):
    scale = 10.0
    return (-np.log(np.exp(-k*(scale*d1)) + np.exp(-k*(scale*d2))))/(k*scale)

# Create figure and subplots
plt.style.use('dark_background')
fig, ax = plt.subplots(figsize=(10, 8))
plt.subplots_adjust(bottom=0.25, right=0.75)  # Make room for controls

# Setup the plot
x = np.linspace(-2, 2, 200)
y = np.linspace(-2, 2, 200)
X, Y = np.meshgrid(x, y)

# Create squares using the defined positions
square1 = sdf_square(X, Y, square1_pos, 1.0)
square2 = sdf_square(X, Y, square2_pos, 1.0)

# Initial union method and radius
union_methods = {
    'Exponential': smooth_union_exp,
    'Polynomial': smooth_union_poly,
    'Quadratic': smooth_union_quad,
    'Power': smooth_union_power,
    'Scaled Exp': smooth_union_scaled_exp
}
current_method = 'Exponential'
initial_radius = 0.5

# Create the plot
def update_plot(radius):
    ax.clear()
    
    # Calculate smooth union
    union = union_methods[current_method](square1, square2, 1/radius)
    
    # Sample some interesting points
    mid_x = (square1_pos[0] + square2_pos[0])/2
    mid_y = (square1_pos[1] + square2_pos[1])/2
    
    # Get SDF values at midpoint between squares
    d1_mid = sdf_square(mid_x, mid_y, square1_pos, 1.0)
    d2_mid = sdf_square(mid_x, mid_y, square2_pos, 1.0)
    print_values(d1_mid, d2_mid, 1/radius)
    
    # Plot the result
    levels = np.linspace(-1, 1, 20)
    contour = ax.contour(X, Y, union, levels=levels, colors='white')
    ax.clabel(contour, inline=True, fontsize=8)
    
    # Add filled contour for negative space (the shape)
    ax.contourf(X, Y, union, levels=[-np.inf, 0], colors=['#404040'])
    
    # Mark sampled point
    ax.plot(mid_x, mid_y, 'r+', markersize=10)
    
    # Set plot limits and labels
    ax.set_xlim(-2, 2)
    ax.set_ylim(-2, 2)
    ax.set_aspect('equal')
    ax.grid(True, alpha=0.3)
    ax.set_title(f'Smooth Union ({current_method})\nRadius: {radius:.3f}')
    
    plt.draw()

# Add slider for radius
ax_radius = plt.axes([0.1, 0.1, 0.65, 0.03])
radius_slider = Slider(
    ax=ax_radius,
    label='Radius',
    valmin=0.01,
    valmax=1.0,
    valinit=initial_radius
)

# Add radio buttons for method selection
ax_radio = plt.axes([0.8, 0.25, 0.15, 0.5])
radio = RadioButtons(
    ax_radio, 
    labels=list(union_methods.keys()),
    active=list(union_methods.keys()).index(current_method)
)

# Update functions
def update_radius(val):
    update_plot(radius_slider.val)

def update_method(label):
    global current_method
    current_method = label
    update_plot(radius_slider.val)

radius_slider.on_changed(update_radius)
radio.on_clicked(update_method)

# Initial plot
update_plot(initial_radius)

# Show the plot
plt.show()
