#include <inttypes.h>

int32_t sample_add_i32(int32_t a, int32_t b) {
    return a + b;
}

int64_t sample_add_i64(int64_t a, int64_t b) {
    return a + b;
}

float sample_add_f32(float a, float b) {
    return a + b;
}

double sample_add_f64(double a, double b) {
    return a + b;
}

int32_t mandelbrot(int32_t max_iters, double cx, double cy) {
    double x0 = cx;
    double y0 = cy;
    double x = 0.0;
    double y = 0.0;
    int32_t iter = 0;
    while (x * x + y * y <= 4 && iter < max_iters) {
        double xtemp = x * x - y * y + x0;
        y = 2 * x * y + y0;
        x = xtemp;
        iter++;
    }
    return iter;
}

void filter_line(uint8_t* dest, const uint8_t* src, int32_t len) {
    dest[0] = src[0];
    for (int32_t i = 1; i < len; i++) {
        dest[i] = src[i] - src[i - 1];
    }
}

// use this to keep from the switch turning into a table lookup
volatile static int32_t x = 0;

int32_t palette_16color(int32_t color) {
    switch (color) {
        case 0: return 0x000000 + x;
        case 1: return 0x000080 + x;
        case 2: return 0x008000 + x;
        case 3: return 0x008080 + x;
        case 4: return 0x800000 + x;
        case 5: return 0x800080 + x;
        case 6: return 0x808000 + x;
        case 7: return 0x808080 + x;
        case 8: return 0xc0c0c0 + x;
        case 9: return 0x0000ff + x;
        case 10: return 0x00ff00 + x;
        case 11: return 0x00ffff + x;
        case 12: return 0xff0000 + x;
        case 13: return 0xff00ff + x;
        case 14: return 0xffff00 + x;
        case 15: return 0xffffff + x;
        default: return -1 + x;
    }
}
