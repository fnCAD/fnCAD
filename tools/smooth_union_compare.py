import numpy as np
import matplotlib.pyplot as plt
from matplotlib.widgets import Slider, RadioButtons
import tkinter as tk
from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg

def sdf_square(x, y, center, size=1.0):
    dx = abs(x - center[0]) - size/2
    dy = abs(y - center[1]) - size/2
    return np.maximum(dx, dy)

def smooth_union_exp(d1, d2, k):
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

# Create main window
root = tk.Tk()
root.title("SDF Smooth Union Comparison")

# Create figure
fig, ax = plt.subplots(figsize=(8, 8))
canvas = FigureCanvasTkAgg(fig, master=root)
canvas.draw()
canvas.get_tk_widget().pack(side=tk.TOP, fill=tk.BOTH, expand=1)

# Setup the plot
x = np.linspace(-2, 2, 200)
y = np.linspace(-2, 2, 200)
X, Y = np.meshgrid(x, y)

# Create squares
square1 = sdf_square(X, Y, (-0.5, 0), 1.0)
square2 = sdf_square(X, Y, (0.5, 0), 1.0)

# Initial union method
union_methods = {
    'Exponential': smooth_union_exp,
    'Polynomial': smooth_union_poly,
    'Quadratic': smooth_union_quad,
    'Power': smooth_union_power,
    'Scaled Exp': smooth_union_scaled_exp
}
current_method = 'Exponential'

# Initial radius
initial_radius = 0.5

def update_plot(radius=None):
    if radius is None:
        radius = radius_slider.val
    
    # Clear the plot
    ax.clear()
    
    # Calculate smooth union
    union = union_methods[current_method](square1, square2, 1/radius)
    
    # Plot the result
    levels = np.linspace(-1, 1, 20)
    contour = ax.contour(X, Y, union, levels=levels)
    ax.clabel(contour, inline=True, fontsize=8)
    
    # Add filled contour for negative space (the shape)
    ax.contourf(X, Y, union, levels=[-np.inf, 0], colors=['lightgray'])
    
    # Set plot limits and labels
    ax.set_xlim(-2, 2)
    ax.set_ylim(-2, 2)
    ax.set_aspect('equal')
    ax.grid(True)
    ax.set_title(f'Smooth Union ({current_method})\nRadius: {radius:.3f}')
    
    # Redraw canvas
    canvas.draw()

# Create slider frame
slider_frame = tk.Frame(root)
slider_frame.pack(side=tk.BOTTOM, fill=tk.X)

# Create radius slider
radius_slider = tk.Scale(
    slider_frame, 
    from_=0.01, 
    to=1.0, 
    resolution=0.01,
    orient=tk.HORIZONTAL,
    label="Radius",
    command=lambda x: update_plot(float(x))
)
radius_slider.set(initial_radius)
radius_slider.pack(side=tk.BOTTOM, fill=tk.X)

# Create method selector frame
method_frame = tk.Frame(root)
method_frame.pack(side=tk.RIGHT, fill=tk.Y)

# Create method selector
def method_changed():
    global current_method
    current_method = method_var.get()
    update_plot()

method_var = tk.StringVar(value=current_method)
for method in union_methods.keys():
    tk.Radiobutton(
        method_frame,
        text=method,
        variable=method_var,
        value=method,
        command=method_changed
    ).pack(anchor=tk.W)

# Initial plot
update_plot(initial_radius)

# Start the GUI
root.mainloop()
